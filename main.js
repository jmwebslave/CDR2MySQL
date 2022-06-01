console.log('Service starting...')

import {config} from './savedconfig.js';

import {access} from 'node:fs/promises';
import {constants} from 'node:fs';

import * as chokidar from 'chokidar';
import * as fs from 'fs'
import neatCsv from 'neat-csv';

console.log('Verifying connection to MySQL')

//Require MySQL DB driver
import * as mysql from 'mysql';

let con = mysql.createConnection({
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database
});

function connectMySQL() {
    return new Promise(function (resolve, reject) {
        con = mysql.createConnection({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database
        });
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

function checkFields() {
    return new Promise(function (resolve, reject) {
        console.log('Checking field list.');
        con.query('SHOW COLUMNS FROM `' + config.mysql.tablename + '`', function (err, results) {
            if (err) {
                console.error('Error (MySQL): Could not get field list. ' + err.message)
                reject()
            }

            let searchFields = config.fields.filter(dataField => dataField.store === true)
            let fieldsOkay = true
            searchFields.forEach(dataField => {
                    if (results.find(element => element.Field === dataField.name)) {
                        console.log('Found field:', dataField.name)
                    } else {
                        console.error('Missing field:', dataField.name)
                        fieldsOkay = false
                    }
                }
            )
            if (fieldsOkay) {
                console.log('Fields are OK');
                resolve()
            } else {
                reject()
            }
        });
    })
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
    con.end();
}

async function startWatching() {
    // One-liner for current directory
    chokidar.watch(config.watchdirectory).on('add', async path => {
        console.log('File ' + path + ' has been found.');
        connectMySQL()
            .then(() => processCDRFile(path))
            .then(() => endConnection())
            .catch(() => {
                console.error("Couldn't complete file " + path)
                endConnection()
            })
    });
}

async function processCDRFile(filePath) {
    console.log('Processing file: ' + filePath)
    return new Promise(function (resolve, reject) {
        fs.readFile(filePath, 'utf8', async (err, data) => {
            if (err) {
                console.error('Error (FS): ' + err);
                reject()
                return;
            }
            let result = await neatCsv(data, {'headers': false})
            result = result.filter(element => {
                return Object.keys(element).length !== 0;
            });
            let fieldSet = ''
            let valuePlaceholder = ''
            let valueSet = []
            result.forEach(cdrRecord => {
                if (Object.keys(cdrRecord).length !== config.fields.length) {
                    console.error("Error (CSV Parse): Number of fields in CDR record ("+Object.keys(cdrRecord).length+") does not match number of fields in config ("+config.fields.length+").")
                    reject()
                } else {
                    console.log('Creating MySQL query')
                    Object.keys(cdrRecord).forEach(key => {
                        if (config.fields[key].store === true) {
                            if (fieldSet !== '') {
                                fieldSet += ', '
                                valuePlaceholder += ', '
                            }
                            fieldSet += '`' + config.fields[key].name + '`'
                            valuePlaceholder += '?'
                            valueSet.push(cdrRecord[key])
                        }
                    })
                    con.query('INSERT INTO ' + config.mysql.tablename + ' (' + fieldSet + ') VALUES (' + valuePlaceholder + ')', valueSet, function (err, results) {
                        if (err) {
                            console.error('Error (MySQL): Could not insert CDR row ' + err.message)
                            reject()
                        }
                        if (results.affectedRows === 1) {
                            console.log('Successfully added one CDR row')
                            fs.unlink(filePath, (err => {
                                if (err) {
                                    console.error('Error (FS): Could not delete file ' + filePath + err);
                                    console.error(err)
                                    reject()
                                } else {
                                    console.log("Deleted file: " + filePath);
                                    resolve();
                                }
                            }));
                        } else {
                            console.error('Error (MySQL): There was an error adding the CDR row')
                            console.error(result)
                            reject()
                        }
                    })
                }
            })
        });
    })

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

