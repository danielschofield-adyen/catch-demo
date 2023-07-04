module.exports.Logger = Logger();

const EventEmitter = require('events');

class Logger extends EventEmitter {
    log(message, data) {
        console.log(message);
    }
}

