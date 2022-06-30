console.log('Service starting...')

import {config} from './savedconfig.js';

import {access} from 'node:fs/promises';
import {constants} from 'node:fs';

import * as chokidar from 'chokidar';
import * as fs from 'fs'
import neatCsv from 'neat-csv';

//Require MySQL DB driver
import * as mysql from 'mysql2';

//Require Postgres DB driver
import * as pg from 'pg'
const { Pool } = pg.default

let workQueue = {
    queueProcessing: false,
    queueItems: []
}

try {
    let con = mysql.createConnection({
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database
    });
} catch (err) {
    console.log('MySQL Connection Error: '+err)
}

const pool = new Pool(config.pg)

async function pg_query (q,p) {
    const client = await pool.connect()
    let res
    try {
        await client.query('BEGIN')
        try {
            res = await client.query(q,p)
            await client.query('COMMIT')
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        }
    } finally {
        client.release()
    }
    return res
}

const con = mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
});

function connectMySQL() {
    return new Promise(function (resolve, reject) {
        console.log('Connecting to the MySQL server.');
        con.connect(function (err) {
            if (err) {
                console.log('Error (MySQL-Connect): ' + err.message);
                reject()
            }
            console.log('Connected to the MySQL server.');
            resolve()
        });
    });

}

async function checkFields() {
        console.log('Checking field list.');
        try {
            const [results, debug] = await con.promise().query('SHOW COLUMNS FROM `' + config.mysql.tablename + '`')
                /*if (err) {
                    console.error('Error (MySQL): Could not get field list. ' + JSON.stringify(err))
                    throw err
                }*/
                console.log(JSON.stringify(results))
                let searchFields = config.fields.filter(dataField => dataField.store === true)
                let fieldsOkay = true
            for (const dataField of searchFields)
            {
                        if (results.find(element => element.Field === dataField.name)) {
                            console.log('Found field:', dataField.name)
                        } else {
                            console.error('Missing field:', dataField.name)
                            fieldsOkay = false
                        }
                    }
                if (fieldsOkay) {
                    console.log('Fields are OK');
                } else {
                    throw debug
                }
        } catch (err) {
            console.log(err)
        }
}

async function directoryExists() {
    try {
        await access(config.watchdirectory, constants.R_OK | constants.W_OK);
        console.log('Can read/write the watch folder');
        return true
    } catch {
        console.error("Error: Can't read/write watch folder.");
        throw new Error()
    }
}

function endConnection() {
    console.log('Disconnecting');
    //con.end();
}

async function startWatching() {
    // One-liner for current directory
    chokidar.watch(config.watchdirectory).on('add', async path => {
        console.log('File ' + path + ' has been found.');
        console.log('Work queue is currently processing: '+workQueue.queueProcessing)
        workQueue.queueItems.push(path)
        if(workQueue.queueProcessing === false) {
            workQueue.queueProcessing = true;
            await startQueue();
        }
        /*console.log('MySQL is currently ' + con.state);
        if(!con.isConnected) {
            connectMySQL()
                .then(() => processCDRFile(path))
                .catch(() => {
                    console.error("Couldn't complete file " + path)
                    endConnection()
                })
        } else {
                processCDRFile(path)
                .catch(() => {
                    console.error("Couldn't complete file " + path)
                    endConnection()
                })
        }

         */
    });
}

async function startQueue() {
    try {
        await connectMySQL()
        for (const queueItem of workQueue.queueItems) {
            try {
                await processCDRFile(queueItem)
                workQueue.queueItems = workQueue.queueItems.filter(e => e !== queueItem)
                console.log("Queue length (Post): " + workQueue.queueItems.length);
                if (workQueue.queueItems.length === 0) {
                    await endConnection();
                    workQueue.queueProcessing = false;
                }
            } catch (filePath) {
                console.log("An error occurred processing " + filePath);
                workQueue.queueItems = workQueue.queueItems.filter(e => e !== filePath)
                console.log("Queue length (Post): " + workQueue.queueItems.length);
                if (workQueue.queueItems.length === 0) {
                    await endConnection();
                    workQueue.queueProcessing = false;
                }
            }
        }
    } catch {
            console.error("Couldn't complete file.")
            await endConnection()
        }
}

async function pgGetQueueStats(callid) {
    console.log('Checking for Queue Stats for callid: ' + JSON.stringify(callid))
    try {
        const { rows } = await pg_query('SELECT * FROM callcent_queuecalls WHERE call_history_id = $1', [callid])
        console.log(JSON.stringify(rows))
    } catch (err) {
        console.log('Database ' + err)
    }
}

async function readFile(filePath) {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        return data;
    } catch {
        console.error('Error (FS): ' + filePath);
        throw filePath
    }
}

async function processCDRFile(filePath) {
        console.log('Processing file: ' + filePath)
        const data = await readFile(filePath)
            /*if (err) {
                console.error('Error (FS): ' + err);
                return;
            }*/
            let result = await neatCsv(data, {'headers': false})
            result = result.filter(element => {
                return Object.keys(element).length !== 0;
            });
            let fieldSet = ''
            let valuePlaceholder = ''
            let valueSet = []
            for (const cdrRecord of result) {
                if (Object.keys(cdrRecord).length !== config.fields.length) {
                    console.error("Error (CSV Parse): Number of fields in CDR record ("+Object.keys(cdrRecord).length+") does not match number of fields in config ("+config.fields.length+").")
                    throw filePath
                } else {
                    console.log('Creating MySQL query for '+filePath)
                    for (const key of Object.keys(cdrRecord)) {
                        if (config.fields[key].store === true) {
                            if (fieldSet !== '') {
                                fieldSet += ', '
                                valuePlaceholder += ', '
                            }
                            fieldSet += '`' + config.fields[key].name + '`'
                            valuePlaceholder += '?'
                            valueSet.push(cdrRecord[key])
                        }
                    }
                    try {
                        const [results, debug] = await con.promise().query('INSERT INTO ' + config.mysql.tablename + ' (' + fieldSet + ') VALUES (' + valuePlaceholder + ')', valueSet)
                            /*if (err) {
                                console.error('Error (MySQL): Could not insert CDR row ' + err.message)
                                throw filePath
                            }*/
                            if (results.affectedRows === 1) {
                                console.log('Successfully added one CDR row')
                                if (config.queuestats) {
                                    try {
                                        await pgGetQueueStats(cdrRecord[1]);
                                    } catch (err) {
                                        console.log('Could not get queue stats for ' + cdrRecord[1])
                                    }
                                }
                                await fs.promises.unlink(filePath, (err => {
                                    if (err) {
                                        console.error('Error (FS): Could not delete file ' + filePath + err);
                                        console.error(err)
                                        throw filePath
                                    } else {
                                        console.log("Deleted file: " + filePath);
                                        return filePath
                                    }
                                }));
                            } else {
                                console.error('Error (MySQL): There was an error adding the CDR row - incorrect number of rows affected')
                                console.error(results)
                                throw filePath
                            }
                    } catch(err) {
                        console.error('Error (MySQL): There was an error adding the CDR row')
                        console.error(err)
                        throw filePath
                    }
                }
            }
}

connectMySQL()
    .then(checkFields)
    .then(directoryExists)
    .catch(() => {
        endConnection()
        console.log("Errors detected in the pre-flight, won't go any further.")
        process.exit(1)
    })
    .then(() => {
        console.log('Preflight was successful!')
        endConnection()
        startWatching().then(() => console.log('Now watching folder ' + config.watchdirectory))
    })

