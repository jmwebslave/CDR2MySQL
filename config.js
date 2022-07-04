let config = {};
config.mysql = {};
config.pg = {};
config.fields = [];
config.qfields = [];

config.watchdirectory = "C:\\Your\\Path";

config.mysql.host = '127.0.0.1';
config.mysql.user = 'username';
config.mysql.password = 'password';
config.mysql.database = 'database_name';
config.mysql.tablename = 'table_name';

//queuestats controls whether the system will go to the 3CX postgres database to fill in additional queue fields for queue calls.
config.queuestats = true;

config.pg.user = 'username';
config.pg.password = 'password';
config.pg.database = 'database';
config.pg.host = '127.0.0.1';
config.pg.port = 5432;
config.pg.max = 3;


//For each field in the CDR (in order) set the MySQL column name, and whether to store this field in the database.  Column name is not required if not storing the field.
config.fields.push({name: 'historyid', store: true})
config.fields.push({name: 'callid', store: true})
config.fields.push({name: 'duration', store: true})
config.fields.push({name: 'time-start', store: true})
config.fields.push({name: 'time-answered', store: true})
config.fields.push({name: 'time-end', store: true})
config.fields.push({name: 'reason-terminated', store: true})
config.fields.push({name: 'from-no', store: true})
config.fields.push({name: 'to-no', store: true})
config.fields.push({name: 'from-dn', store: true})
config.fields.push({name: 'to-dn', store: true})
config.fields.push({name: 'dial-no', store: true})
config.fields.push({name: 'reason-changed', store: true})
config.fields.push({name: 'final-number', store: true})
config.fields.push({name: 'final-dn', store: true})
config.fields.push({name: 'bill-code', store: true})
config.fields.push({name: 'bill-rate', store: true})
config.fields.push({name: 'bill-cost', store: true})
config.fields.push({name: 'bill-name', store: true})
config.fields.push({name: 'chain', store: true})
config.fields.push({name: 'from-dispname', store: true})
config.fields.push({name: 'to-dispname', store: true})
config.fields.push({name: 'final-dispname', store: true})
config.fields.push({name: 'missed-queue-calls', store: true})

//For each field we are interested in the queue data table give the field we want to map it to in MySQL (note the three timespans aren't listed here because we do them separately)
config.qfields.push({srcname: 'q_num', dstname: 'q_num'})
config.qfields.push({srcname: 'reason_noanswercode', dstname: 'reason_noanswercode'})
config.qfields.push({srcname: 'reason_failcode', dstname: 'reason_failcode'})
config.qfields.push({srcname: 'reason_noanswerdesc', dstname: 'reason_noanswerdesc'})
config.qfields.push({srcname: 'reason_faildesc', dstname: 'reason_faildesc'})
config.qfields.push({srcname: 'to_dn', dstname: 'to_dn'})

export {config}