var config = require('./config');
var db = require('./lib/db');
var l10n = require('./lib/l10n');
var conversation_model = require('./models/conversation');
var attrition_model = require('./models/attrition');
var bot_model = require('./models/bot');
var message_model = require('./models/message');

var ATTRITION_ADMIN_SUMMARY = '23_hours';
var ATTRITION_QUERY = [
    'SELECT *',
    'FROM   conversations',
    'WHERE  nudged = false',
    'AND    complete = false',
    'AND    updated < now() - \'23 hours\'::interval',
    'AND    updated > now() - \'24 hours\'::interval',
];

db.query(
    ATTRITION_QUERY.join('\n'))
    .then(function(conversations) {
        console.log('Found conversations: ', conversations.length);
        return nudge(conversations);
    });

var nudge = function(stack) {
    if (stack.length == 0) {
        console.log('Nothing more to do. kthxbai');
        process.exit(0);
    }

    var conversation = stack.shift();

    console.log('Nudging conversation: ', conversation.id);
    console.log(' - creating attrition log...');

    return attrition_model.create({
        admin_summary:      ATTRITION_ADMIN_SUMMARY,
        conversation_id:    conversation.id,
        step_name:          conversation.state.step,
        dropoff_time:       conversation.updated,
        created:            db.now()
    }).then(function(attrition_log) {
        conversation.state.back = conversation.state.step;
        conversation.state.step = 'nudge';
        conversation.state.attrition_log_id = attrition_log.id;

        console.log(' - setting new state: ', conversation.state);
        return conversation_model.update(conversation.id, {
            state: conversation.state,
            nudged: true
        })
    }).then(function(whatever) {
        var msg = l10n('prompt_nudge', conversation.locale);

        console.log(' - sending message to user: ', msg);
        return message_model.create(config.bot.user_id, conversation.id, {body: msg})
    }).then(function(lol) {
        console.log(' - Proceeding to next conversation...');
        return nudge(stack);
    });

};