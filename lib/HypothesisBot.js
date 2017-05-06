var Botkit = require(__dirname + '/CoreBot.js');
var WebSocket = require('WS');
var request = require('request');

var token = process.env.token;

function HypothesisBot(configuration) {

    // Create a core botkit bot
    var h_botkit = Botkit(configuration || {});

    h_botkit.middleware.spawn.use(function(bot, next) {
        h_botkit.listenWS(bot);
        next();
    });

    h_botkit.defineBot(function(botkit, config) {

        var bot = {
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
        };

        bot.startConversation = function(message, cb) {
            botkit.startConversation(this, message, cb);
        };

        bot.send = function(message, cb) {
            console.log('BOT:', message.text);

            request({
                method: 'POST',
                url: 'https://hypothes.is/api/annotations',
                headers: {
                    Authorization: 'Bearer ' + token,
                },
                json: true,
                body: {
                	references: message.references,
                	text: message.text,
                	uri: message.uri,
                	permissions: {
                		read: ['group:__world__']
                	}
                }
            }, function(error, response, body){
                console.log(error, body);
            });
        };

        bot.reply = function(src, resp, cb) {
            var msg = {};

            if (typeof(resp) == 'string') {
                msg.text = resp;
            } else {
                msg = resp;
            }

            msg.channel = src.channel;
            msg.references = src.references;
            // msg.references.push(src.id);
            msg.uri = src.uri;

            bot.say(msg, cb);
        };

        bot.findConversation = function(message, cb) {
            botkit.debug('CUSTOM FIND CONVO', message.user, message.channel);
            for (var t = 0; t < botkit.tasks.length; t++) {
                for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
                    if (
                        botkit.tasks[t].convos[c].isActive() &&
                        botkit.tasks[t].convos[c].source_message.user == message.user
                    ) {
                        botkit.debug('FOUND EXISTING CONVO!');
                        cb(botkit.tasks[t].convos[c]);
                        return;
                    }
                }
            }

            cb();
        };

        return bot;
    });

    h_botkit.listenWS = function(bot) {
        h_botkit.startTicking();

        var socket = new WebSocket('wss://hypothes.is/ws?access_token=' + token, {
            perMessageDeflate: false
        });

        socket.on('open', function () {
            socket.send(JSON.stringify({
                id: new Date().getTime(),
                type: 'ping'
            }));

            socket.send(JSON.stringify({
            	filter: {
                  	match_policy: "include_all",
                    clauses: [],
                    actions: {
                        create: true,
                        update: true,
                        delete: true
                    }
             	}
            }));
        });

        socket.on('message', function (raw, flags) {
            console.log(raw, flags);
            var data = JSON.parse(raw);

            if (data.type !== 'annotation-notification') return;
            if (data.options.action !== 'create') return;

            for (var annotation of data.payload) {
                var message = {
                    text: annotation.text,
                    user: annotation.user,
                    channel: 'text',
                    timestamp: new Date(annotation.created),
                    references: annotation.references,
                    uri: annotation.uri,
                };
                message.references.push(annotation.id);
                console.log(message);
                h_botkit.receiveMessage(bot, message);
            }
        });
    };

    return h_botkit;
};

module.exports = HypothesisBot;
