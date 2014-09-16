!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.gamepad=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// var peer = require('./lib/peer');
// var Promise = require('./lib/promise-1.0.0.js');  // jshint ignore:line
var Modal = require('./lib/modal');
var settings = require('./settings');
var utils = require('./lib/utils');
var error = utils.error;
var trace = utils.trace;


if (!('performance' in window)) {
  window.performance = {
    now: function () {
      return +new Date();
    }
  };
}

if (('origin' in window.location)) {
  window.location.origin = window.location.protocol + '//' + window.location.host;
}


/**
 * A library for controlling an HTML5 game using WebRTC.
 *
 * @exports gamepad
 * @namespace gamepad
 */
function gamepad() {
}


/**
 * 1. Your PC connects to the server.
 * 2. The server gives your PC a randomly generated number and remembers the combination of number and PC.
 * 3. From your mobile device, specify a number and connect to the server.
 * 4. If the number specified is the same as from a connected PC, your mobile device is paired with that PC.
 * 5. If there is no designated PC, an error occurs.
 * 6. When data comes in from your mobile device, it is sent to the PC with which it is paired, and vice versa.
 */


/**
 * Does a handshake with PeerJS' WebSocket server to get a peer ID.
 *
 * Once we have the peer ID, we can tell the controller how to find us. Then
 * all communication between the host and the controller is peer-to-peer via
 * WebRTC data channels.
 *
 * @param {String} peerId The peer ID.
 * @returns {Promise}
 * @memberOf gamepad
 */
gamepad.peerHandshake = function (peerId) {
  return new Promise(function (resolve, reject) {
    if (!peerId) {
      peerId = utils.getPeerId();  // The host ID.
    }

    var peer = new Peer(peerId, {
      key: settings.PEERJS_KEY,
      debug: settings.DEBUG ? 3 : 0
    });

    window.addEventListener('beforeunload', function () {
      peer.destroy();
    });

    peer.on('open', function () {
      trace('My peer ID: ' + peer.id);
      resolve(peer);
    });
  });
};


/**
 * Listens for a peer connection with the controller via WebRTC data channels.
 *
 * If one is given, we will tell PeerJS to use the peer ID the query-string.
 *
 * @returns {Promise}
 * @memberOf gamepad
 */
gamepad.peerConnect = function (peer) {
  return new Promise(function (resolve, reject) {
    peer.on('connection', function (conn) {
      conn.on('data', function (data) {
        trace('Received: ' + (typeof data === 'object' ? JSON.stringify(data) : ''));
      });

      conn.on('error', function (err) {
        error(err.message);
        reject(err);
      });

      // We've connected to a controller.
      resolve(conn);
    });
  });
};


/**
 * Connects to a peer (controller).
 *
 * Establishes connection with peer.
 *
 * @returns {Promise}
 * @memberOf gamepad
 */
gamepad.pair = function (peerId) {
  return new Promise(function (resolve) {

    return gamepad.peerHandshake(peerId).then(function (peer) {
      var pairId = peer.id;  // This should be the same as `peerId`, but this comes from PeerJS, which is the source of truth.
      var pairIdEsc = encodeURIComponent(pairId);
      var pairUrl = galaxyOrigin + '/client.html?' + pairIdEsc;

      // Update the querystring in the address bar.
      window.history.replaceState(null, null, window.location.pathname + '?' + pairIdEsc);

      var content = (
        '<div class="overlay pair-overlay" id="pair-overlay">' +
          '<div class="pair">URL: <a href="' + pairUrl + '" class="pair-url" target="_blank">' + pairIdEsc + '</a></div>' +
          '<div class="code-heading">Code: <b class="pair-code">' + pairIdEsc + '</b></div>' +
        '</div>'
      );

      var modal = new Modal({
        id: 'pairing-screen',
        classes: 'slim',
        title: 'Pair your mobile phone',
        content: content
      }, true);

      // todo: replace `setTimeout`s with `transitionend` event listeners.
      setTimeout(function () {
        modal.open();
      }, 150);

      setTimeout(function () {
        modal.close();
        resolve();
      }, 151);

      // todo: remember in `localStorage` the host ID + controller ID.

      [
        'https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,700',
        '../css/main.css'
      ].forEach(function (stylesheet) {
        utils.injectCSS({href: stylesheet});
      });

      gamepad.peerConnect(peer).then(function (conn) {
        console.log('Peer connected');
        modal.close();
        resolve(conn);
      });

    }).catch(console.error.bind(console));
  });
};


gamepad.hidePairingScreen = function () {
  Modal.closeAll();
};


gamepad.version = settings.VERSION;


var galaxyOrigin = window.location.origin;
var dataOrigin = document.querySelector('[data-galaxy-origin]');
if (dataOrigin) {
  gamepad.galaxyOrigin = dataOrigin.dataset.galaxyOrigin;
}


module.exports = gamepad;

},{"./lib/modal":2,"./lib/utils":3,"./settings":4}],2:[function(require,module,exports){
var utils = require('./utils');


function Modal(opts, inject) {
  // Create properties for `id`, `classes`, `title`, and `content`.
  Object.keys(opts).forEach(function (key) {
    this[key] = opts[key];
  }.bind(this));

  if (inject) {
    this.inject();
  }
}

Modal.closeAll = Modal.prototype.close = function () {
  // Close any open modal.
  var openedModal = document.querySelector('.md-show');
  if (openedModal) {
    openedModal.classList.remove('md-show');
  }
  // TODO: Wait until transition end.
  setTimeout(function () {
    document.body.classList.remove('galaxy-overlayed');
  }, 150);
};

Modal.injectOverlay = function () {
  // Inject the overlay we use for overlaying it behind modals.
  if (!document.querySelector('.md-overlay')) {
    var d = document.createElement('div');
    d.className = 'md-overlay';
    document.body.appendChild(d);
  }
};

Modal.prototype.html = function () {
  var d = document.createElement('div');
  d.id = 'modal-' + this.id;
  d.className = 'md-modal md-effect-1 ' + (this.classes || '');
  d.innerHTML = (
    '<div class="md-content">' +
      '<h3>' + utils.escape(this.title) + '</h3> ' +
      '<a class="md-close" title="Close"><span><div>Close</div></span></a>' +
      '<div>' + this.content + '</div>' +
    '</div>'
  );
  return d;
};

Modal.prototype.inject = function () {
  Modal.injectOverlay();

  this.el = this.html();

  document.body.appendChild(this.el);
  document.body.classList.add('galaxy-overlayed');

  return this.el;
};

Modal.prototype.open = function () {
  this.el.classList.add('md-show');
};


module.exports = Modal;

},{"./utils":3}],3:[function(require,module,exports){
function trace(text, level) {
  console[level || 'log']((window.performance.now() / 1000).toFixed(3) + ': ' + text);
}


function error(text) {
  return trace(text, 'error');
}


function warn(text) {
  return trace(text, 'warn');
}


function getPeerId() {
  return (window.location.pathname.indexOf('.html') ?
    window.location.search.substr(1) : window.location.pathname.substr(1));
}


var FIELD_FOCUSED_TAGS = [
  'input',
  'keygen',
  'meter',
  'option',
  'output',
  'progress',
  'select',
  'textarea'
];
function fieldFocused(e) {
  return FIELD_FOCUSED_TAGS.indexOf(e.target.nodeName.toLowerCase()) !== -1;
}


function hasTouchEvents() {
  return ('ontouchstart' in window ||
    window.DocumentTouch && document instanceof DocumentTouch);
}

function injectCSS(opts) {
  var link = document.createElement('link');
  link.href = opts.href;
  link.media = 'all';
  link.rel = 'stylesheet';
  link.type = 'text/css';
  Object.keys(opts || {}).forEach(function (prop) {
    link[prop] = opts[prop];
  });
  document.querySelector('head').appendChild(link);
}

function escape(text) {
  if (!text) {
    return text;
  }
  return text.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/'/g, '&#39;')
             .replace(/"/g, '&#34;');
}


module.exports.trace = trace;
module.exports.error = error;
module.exports.warn = warn;
module.exports.getPeerId = getPeerId;
module.exports.fieldFocused = fieldFocused;
module.exports.hasTouchEvents = hasTouchEvents;
module.exports.injectCSS = injectCSS;
module.exports.escape = escape;

},{}],4:[function(require,module,exports){
var settings_local = {};
try {
  settings_local = require('./settings_local.js');
} catch (e) {
}

var settings = {
  API_URL: 'http://localhost:5000',  // This URL to the Galaxy API. No trailing slash.
  DEBUG: false,
  PEERJS_KEY: '',  // Sign up for a key at http://peerjs.com/peerserver
  VERSION: '0.0.1'  // Version of the `gamepad.js` script
};

for (var key in settings_local) {
  settings[key] = settings_local[key];
}

module.exports = settings;

},{"./settings_local.js":5}],5:[function(require,module,exports){
module.exports = {
  DEBUG: true,
  PEERJS_KEY: 'rovu5xmqo69wwmi'
};

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9vcHQvZ2FsYXh5LmpzLW1vYmlsZS1nYW1lcGFkL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL3NyYy9qcy9ob3N0LmpzIiwiL29wdC9nYWxheHkuanMtbW9iaWxlLWdhbWVwYWQvc3JjL2pzL2xpYi9tb2RhbC5qcyIsIi9vcHQvZ2FsYXh5LmpzLW1vYmlsZS1nYW1lcGFkL3NyYy9qcy9saWIvdXRpbHMuanMiLCIvb3B0L2dhbGF4eS5qcy1tb2JpbGUtZ2FtZXBhZC9zcmMvanMvc2V0dGluZ3MuanMiLCIvb3B0L2dhbGF4eS5qcy1tb2JpbGUtZ2FtZXBhZC9zcmMvanMvc2V0dGluZ3NfbG9jYWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyB2YXIgcGVlciA9IHJlcXVpcmUoJy4vbGliL3BlZXInKTtcbi8vIHZhciBQcm9taXNlID0gcmVxdWlyZSgnLi9saWIvcHJvbWlzZS0xLjAuMC5qcycpOyAgLy8ganNoaW50IGlnbm9yZTpsaW5lXG52YXIgTW9kYWwgPSByZXF1aXJlKCcuL2xpYi9tb2RhbCcpO1xudmFyIHNldHRpbmdzID0gcmVxdWlyZSgnLi9zZXR0aW5ncycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi9saWIvdXRpbHMnKTtcbnZhciBlcnJvciA9IHV0aWxzLmVycm9yO1xudmFyIHRyYWNlID0gdXRpbHMudHJhY2U7XG5cblxuaWYgKCEoJ3BlcmZvcm1hbmNlJyBpbiB3aW5kb3cpKSB7XG4gIHdpbmRvdy5wZXJmb3JtYW5jZSA9IHtcbiAgICBub3c6IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiArbmV3IERhdGUoKTtcbiAgICB9XG4gIH07XG59XG5cbmlmICgoJ29yaWdpbicgaW4gd2luZG93LmxvY2F0aW9uKSkge1xuICB3aW5kb3cubG9jYXRpb24ub3JpZ2luID0gd2luZG93LmxvY2F0aW9uLnByb3RvY29sICsgJy8vJyArIHdpbmRvdy5sb2NhdGlvbi5ob3N0O1xufVxuXG5cbi8qKlxuICogQSBsaWJyYXJ5IGZvciBjb250cm9sbGluZyBhbiBIVE1MNSBnYW1lIHVzaW5nIFdlYlJUQy5cbiAqXG4gKiBAZXhwb3J0cyBnYW1lcGFkXG4gKiBAbmFtZXNwYWNlIGdhbWVwYWRcbiAqL1xuZnVuY3Rpb24gZ2FtZXBhZCgpIHtcbn1cblxuXG4vKipcbiAqIDEuIFlvdXIgUEMgY29ubmVjdHMgdG8gdGhlIHNlcnZlci5cbiAqIDIuIFRoZSBzZXJ2ZXIgZ2l2ZXMgeW91ciBQQyBhIHJhbmRvbWx5IGdlbmVyYXRlZCBudW1iZXIgYW5kIHJlbWVtYmVycyB0aGUgY29tYmluYXRpb24gb2YgbnVtYmVyIGFuZCBQQy5cbiAqIDMuIEZyb20geW91ciBtb2JpbGUgZGV2aWNlLCBzcGVjaWZ5IGEgbnVtYmVyIGFuZCBjb25uZWN0IHRvIHRoZSBzZXJ2ZXIuXG4gKiA0LiBJZiB0aGUgbnVtYmVyIHNwZWNpZmllZCBpcyB0aGUgc2FtZSBhcyBmcm9tIGEgY29ubmVjdGVkIFBDLCB5b3VyIG1vYmlsZSBkZXZpY2UgaXMgcGFpcmVkIHdpdGggdGhhdCBQQy5cbiAqIDUuIElmIHRoZXJlIGlzIG5vIGRlc2lnbmF0ZWQgUEMsIGFuIGVycm9yIG9jY3Vycy5cbiAqIDYuIFdoZW4gZGF0YSBjb21lcyBpbiBmcm9tIHlvdXIgbW9iaWxlIGRldmljZSwgaXQgaXMgc2VudCB0byB0aGUgUEMgd2l0aCB3aGljaCBpdCBpcyBwYWlyZWQsIGFuZCB2aWNlIHZlcnNhLlxuICovXG5cblxuLyoqXG4gKiBEb2VzIGEgaGFuZHNoYWtlIHdpdGggUGVlckpTJyBXZWJTb2NrZXQgc2VydmVyIHRvIGdldCBhIHBlZXIgSUQuXG4gKlxuICogT25jZSB3ZSBoYXZlIHRoZSBwZWVyIElELCB3ZSBjYW4gdGVsbCB0aGUgY29udHJvbGxlciBob3cgdG8gZmluZCB1cy4gVGhlblxuICogYWxsIGNvbW11bmljYXRpb24gYmV0d2VlbiB0aGUgaG9zdCBhbmQgdGhlIGNvbnRyb2xsZXIgaXMgcGVlci10by1wZWVyIHZpYVxuICogV2ViUlRDIGRhdGEgY2hhbm5lbHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBlZXJJZCBUaGUgcGVlciBJRC5cbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICogQG1lbWJlck9mIGdhbWVwYWRcbiAqL1xuZ2FtZXBhZC5wZWVySGFuZHNoYWtlID0gZnVuY3Rpb24gKHBlZXJJZCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIGlmICghcGVlcklkKSB7XG4gICAgICBwZWVySWQgPSB1dGlscy5nZXRQZWVySWQoKTsgIC8vIFRoZSBob3N0IElELlxuICAgIH1cblxuICAgIHZhciBwZWVyID0gbmV3IFBlZXIocGVlcklkLCB7XG4gICAgICBrZXk6IHNldHRpbmdzLlBFRVJKU19LRVksXG4gICAgICBkZWJ1Zzogc2V0dGluZ3MuREVCVUcgPyAzIDogMFxuICAgIH0pO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHBlZXIuZGVzdHJveSgpO1xuICAgIH0pO1xuXG4gICAgcGVlci5vbignb3BlbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHRyYWNlKCdNeSBwZWVyIElEOiAnICsgcGVlci5pZCk7XG4gICAgICByZXNvbHZlKHBlZXIpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhIHBlZXIgY29ubmVjdGlvbiB3aXRoIHRoZSBjb250cm9sbGVyIHZpYSBXZWJSVEMgZGF0YSBjaGFubmVscy5cbiAqXG4gKiBJZiBvbmUgaXMgZ2l2ZW4sIHdlIHdpbGwgdGVsbCBQZWVySlMgdG8gdXNlIHRoZSBwZWVyIElEIHRoZSBxdWVyeS1zdHJpbmcuXG4gKlxuICogQHJldHVybnMge1Byb21pc2V9XG4gKiBAbWVtYmVyT2YgZ2FtZXBhZFxuICovXG5nYW1lcGFkLnBlZXJDb25uZWN0ID0gZnVuY3Rpb24gKHBlZXIpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICBwZWVyLm9uKCdjb25uZWN0aW9uJywgZnVuY3Rpb24gKGNvbm4pIHtcbiAgICAgIGNvbm4ub24oJ2RhdGEnLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICB0cmFjZSgnUmVjZWl2ZWQ6ICcgKyAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkoZGF0YSkgOiAnJykpO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbm4ub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBlcnJvcihlcnIubWVzc2FnZSk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFdlJ3ZlIGNvbm5lY3RlZCB0byBhIGNvbnRyb2xsZXIuXG4gICAgICByZXNvbHZlKGNvbm4pO1xuICAgIH0pO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBDb25uZWN0cyB0byBhIHBlZXIgKGNvbnRyb2xsZXIpLlxuICpcbiAqIEVzdGFibGlzaGVzIGNvbm5lY3Rpb24gd2l0aCBwZWVyLlxuICpcbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICogQG1lbWJlck9mIGdhbWVwYWRcbiAqL1xuZ2FtZXBhZC5wYWlyID0gZnVuY3Rpb24gKHBlZXJJZCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcblxuICAgIHJldHVybiBnYW1lcGFkLnBlZXJIYW5kc2hha2UocGVlcklkKS50aGVuKGZ1bmN0aW9uIChwZWVyKSB7XG4gICAgICB2YXIgcGFpcklkID0gcGVlci5pZDsgIC8vIFRoaXMgc2hvdWxkIGJlIHRoZSBzYW1lIGFzIGBwZWVySWRgLCBidXQgdGhpcyBjb21lcyBmcm9tIFBlZXJKUywgd2hpY2ggaXMgdGhlIHNvdXJjZSBvZiB0cnV0aC5cbiAgICAgIHZhciBwYWlySWRFc2MgPSBlbmNvZGVVUklDb21wb25lbnQocGFpcklkKTtcbiAgICAgIHZhciBwYWlyVXJsID0gZ2FsYXh5T3JpZ2luICsgJy9jbGllbnQuaHRtbD8nICsgcGFpcklkRXNjO1xuXG4gICAgICAvLyBVcGRhdGUgdGhlIHF1ZXJ5c3RyaW5nIGluIHRoZSBhZGRyZXNzIGJhci5cbiAgICAgIHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCBudWxsLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnPycgKyBwYWlySWRFc2MpO1xuXG4gICAgICB2YXIgY29udGVudCA9IChcbiAgICAgICAgJzxkaXYgY2xhc3M9XCJvdmVybGF5IHBhaXItb3ZlcmxheVwiIGlkPVwicGFpci1vdmVybGF5XCI+JyArXG4gICAgICAgICAgJzxkaXYgY2xhc3M9XCJwYWlyXCI+VVJMOiA8YSBocmVmPVwiJyArIHBhaXJVcmwgKyAnXCIgY2xhc3M9XCJwYWlyLXVybFwiIHRhcmdldD1cIl9ibGFua1wiPicgKyBwYWlySWRFc2MgKyAnPC9hPjwvZGl2PicgK1xuICAgICAgICAgICc8ZGl2IGNsYXNzPVwiY29kZS1oZWFkaW5nXCI+Q29kZTogPGIgY2xhc3M9XCJwYWlyLWNvZGVcIj4nICsgcGFpcklkRXNjICsgJzwvYj48L2Rpdj4nICtcbiAgICAgICAgJzwvZGl2PidcbiAgICAgICk7XG5cbiAgICAgIHZhciBtb2RhbCA9IG5ldyBNb2RhbCh7XG4gICAgICAgIGlkOiAncGFpcmluZy1zY3JlZW4nLFxuICAgICAgICBjbGFzc2VzOiAnc2xpbScsXG4gICAgICAgIHRpdGxlOiAnUGFpciB5b3VyIG1vYmlsZSBwaG9uZScsXG4gICAgICAgIGNvbnRlbnQ6IGNvbnRlbnRcbiAgICAgIH0sIHRydWUpO1xuXG4gICAgICAvLyB0b2RvOiByZXBsYWNlIGBzZXRUaW1lb3V0YHMgd2l0aCBgdHJhbnNpdGlvbmVuZGAgZXZlbnQgbGlzdGVuZXJzLlxuICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIG1vZGFsLm9wZW4oKTtcbiAgICAgIH0sIDE1MCk7XG5cbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICBtb2RhbC5jbG9zZSgpO1xuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9LCAxNTEpO1xuXG4gICAgICAvLyB0b2RvOiByZW1lbWJlciBpbiBgbG9jYWxTdG9yYWdlYCB0aGUgaG9zdCBJRCArIGNvbnRyb2xsZXIgSUQuXG5cbiAgICAgIFtcbiAgICAgICAgJ2h0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzP2ZhbWlseT1Tb3VyY2UrU2FucytQcm86MzAwLDQwMCw3MDAnLFxuICAgICAgICAnLi4vY3NzL21haW4uY3NzJ1xuICAgICAgXS5mb3JFYWNoKGZ1bmN0aW9uIChzdHlsZXNoZWV0KSB7XG4gICAgICAgIHV0aWxzLmluamVjdENTUyh7aHJlZjogc3R5bGVzaGVldH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGdhbWVwYWQucGVlckNvbm5lY3QocGVlcikudGhlbihmdW5jdGlvbiAoY29ubikge1xuICAgICAgICBjb25zb2xlLmxvZygnUGVlciBjb25uZWN0ZWQnKTtcbiAgICAgICAgbW9kYWwuY2xvc2UoKTtcbiAgICAgICAgcmVzb2x2ZShjb25uKTtcbiAgICAgIH0pO1xuXG4gICAgfSkuY2F0Y2goY29uc29sZS5lcnJvci5iaW5kKGNvbnNvbGUpKTtcbiAgfSk7XG59O1xuXG5cbmdhbWVwYWQuaGlkZVBhaXJpbmdTY3JlZW4gPSBmdW5jdGlvbiAoKSB7XG4gIE1vZGFsLmNsb3NlQWxsKCk7XG59O1xuXG5cbmdhbWVwYWQudmVyc2lvbiA9IHNldHRpbmdzLlZFUlNJT047XG5cblxudmFyIGdhbGF4eU9yaWdpbiA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW47XG52YXIgZGF0YU9yaWdpbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLWdhbGF4eS1vcmlnaW5dJyk7XG5pZiAoZGF0YU9yaWdpbikge1xuICBnYW1lcGFkLmdhbGF4eU9yaWdpbiA9IGRhdGFPcmlnaW4uZGF0YXNldC5nYWxheHlPcmlnaW47XG59XG5cblxubW9kdWxlLmV4cG9ydHMgPSBnYW1lcGFkO1xuIiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG5cbmZ1bmN0aW9uIE1vZGFsKG9wdHMsIGluamVjdCkge1xuICAvLyBDcmVhdGUgcHJvcGVydGllcyBmb3IgYGlkYCwgYGNsYXNzZXNgLCBgdGl0bGVgLCBhbmQgYGNvbnRlbnRgLlxuICBPYmplY3Qua2V5cyhvcHRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB0aGlzW2tleV0gPSBvcHRzW2tleV07XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgaWYgKGluamVjdCkge1xuICAgIHRoaXMuaW5qZWN0KCk7XG4gIH1cbn1cblxuTW9kYWwuY2xvc2VBbGwgPSBNb2RhbC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENsb3NlIGFueSBvcGVuIG1vZGFsLlxuICB2YXIgb3BlbmVkTW9kYWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWQtc2hvdycpO1xuICBpZiAob3BlbmVkTW9kYWwpIHtcbiAgICBvcGVuZWRNb2RhbC5jbGFzc0xpc3QucmVtb3ZlKCdtZC1zaG93Jyk7XG4gIH1cbiAgLy8gVE9ETzogV2FpdCB1bnRpbCB0cmFuc2l0aW9uIGVuZC5cbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdnYWxheHktb3ZlcmxheWVkJyk7XG4gIH0sIDE1MCk7XG59O1xuXG5Nb2RhbC5pbmplY3RPdmVybGF5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBJbmplY3QgdGhlIG92ZXJsYXkgd2UgdXNlIGZvciBvdmVybGF5aW5nIGl0IGJlaGluZCBtb2RhbHMuXG4gIGlmICghZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1kLW92ZXJsYXknKSkge1xuICAgIHZhciBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZC5jbGFzc05hbWUgPSAnbWQtb3ZlcmxheSc7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkKTtcbiAgfVxufTtcblxuTW9kYWwucHJvdG90eXBlLmh0bWwgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGQuaWQgPSAnbW9kYWwtJyArIHRoaXMuaWQ7XG4gIGQuY2xhc3NOYW1lID0gJ21kLW1vZGFsIG1kLWVmZmVjdC0xICcgKyAodGhpcy5jbGFzc2VzIHx8ICcnKTtcbiAgZC5pbm5lckhUTUwgPSAoXG4gICAgJzxkaXYgY2xhc3M9XCJtZC1jb250ZW50XCI+JyArXG4gICAgICAnPGgzPicgKyB1dGlscy5lc2NhcGUodGhpcy50aXRsZSkgKyAnPC9oMz4gJyArXG4gICAgICAnPGEgY2xhc3M9XCJtZC1jbG9zZVwiIHRpdGxlPVwiQ2xvc2VcIj48c3Bhbj48ZGl2PkNsb3NlPC9kaXY+PC9zcGFuPjwvYT4nICtcbiAgICAgICc8ZGl2PicgKyB0aGlzLmNvbnRlbnQgKyAnPC9kaXY+JyArXG4gICAgJzwvZGl2PidcbiAgKTtcbiAgcmV0dXJuIGQ7XG59O1xuXG5Nb2RhbC5wcm90b3R5cGUuaW5qZWN0ID0gZnVuY3Rpb24gKCkge1xuICBNb2RhbC5pbmplY3RPdmVybGF5KCk7XG5cbiAgdGhpcy5lbCA9IHRoaXMuaHRtbCgpO1xuXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5lbCk7XG4gIGRvY3VtZW50LmJvZHkuY2xhc3NMaXN0LmFkZCgnZ2FsYXh5LW92ZXJsYXllZCcpO1xuXG4gIHJldHVybiB0aGlzLmVsO1xufTtcblxuTW9kYWwucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuZWwuY2xhc3NMaXN0LmFkZCgnbWQtc2hvdycpO1xufTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IE1vZGFsO1xuIiwiZnVuY3Rpb24gdHJhY2UodGV4dCwgbGV2ZWwpIHtcbiAgY29uc29sZVtsZXZlbCB8fCAnbG9nJ10oKHdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSAvIDEwMDApLnRvRml4ZWQoMykgKyAnOiAnICsgdGV4dCk7XG59XG5cblxuZnVuY3Rpb24gZXJyb3IodGV4dCkge1xuICByZXR1cm4gdHJhY2UodGV4dCwgJ2Vycm9yJyk7XG59XG5cblxuZnVuY3Rpb24gd2Fybih0ZXh0KSB7XG4gIHJldHVybiB0cmFjZSh0ZXh0LCAnd2FybicpO1xufVxuXG5cbmZ1bmN0aW9uIGdldFBlZXJJZCgpIHtcbiAgcmV0dXJuICh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuaW5kZXhPZignLmh0bWwnKSA/XG4gICAgd2luZG93LmxvY2F0aW9uLnNlYXJjaC5zdWJzdHIoMSkgOiB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuc3Vic3RyKDEpKTtcbn1cblxuXG52YXIgRklFTERfRk9DVVNFRF9UQUdTID0gW1xuICAnaW5wdXQnLFxuICAna2V5Z2VuJyxcbiAgJ21ldGVyJyxcbiAgJ29wdGlvbicsXG4gICdvdXRwdXQnLFxuICAncHJvZ3Jlc3MnLFxuICAnc2VsZWN0JyxcbiAgJ3RleHRhcmVhJ1xuXTtcbmZ1bmN0aW9uIGZpZWxkRm9jdXNlZChlKSB7XG4gIHJldHVybiBGSUVMRF9GT0NVU0VEX1RBR1MuaW5kZXhPZihlLnRhcmdldC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpKSAhPT0gLTE7XG59XG5cblxuZnVuY3Rpb24gaGFzVG91Y2hFdmVudHMoKSB7XG4gIHJldHVybiAoJ29udG91Y2hzdGFydCcgaW4gd2luZG93IHx8XG4gICAgd2luZG93LkRvY3VtZW50VG91Y2ggJiYgZG9jdW1lbnQgaW5zdGFuY2VvZiBEb2N1bWVudFRvdWNoKTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0Q1NTKG9wdHMpIHtcbiAgdmFyIGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XG4gIGxpbmsuaHJlZiA9IG9wdHMuaHJlZjtcbiAgbGluay5tZWRpYSA9ICdhbGwnO1xuICBsaW5rLnJlbCA9ICdzdHlsZXNoZWV0JztcbiAgbGluay50eXBlID0gJ3RleHQvY3NzJztcbiAgT2JqZWN0LmtleXMob3B0cyB8fCB7fSkuZm9yRWFjaChmdW5jdGlvbiAocHJvcCkge1xuICAgIGxpbmtbcHJvcF0gPSBvcHRzW3Byb3BdO1xuICB9KTtcbiAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignaGVhZCcpLmFwcGVuZENoaWxkKGxpbmspO1xufVxuXG5mdW5jdGlvbiBlc2NhcGUodGV4dCkge1xuICBpZiAoIXRleHQpIHtcbiAgICByZXR1cm4gdGV4dDtcbiAgfVxuICByZXR1cm4gdGV4dC5yZXBsYWNlKC8mL2csICcmYW1wOycpXG4gICAgICAgICAgICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgICAgICAgICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCAnJiMzOTsnKVxuICAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAnJiMzNDsnKTtcbn1cblxuXG5tb2R1bGUuZXhwb3J0cy50cmFjZSA9IHRyYWNlO1xubW9kdWxlLmV4cG9ydHMuZXJyb3IgPSBlcnJvcjtcbm1vZHVsZS5leHBvcnRzLndhcm4gPSB3YXJuO1xubW9kdWxlLmV4cG9ydHMuZ2V0UGVlcklkID0gZ2V0UGVlcklkO1xubW9kdWxlLmV4cG9ydHMuZmllbGRGb2N1c2VkID0gZmllbGRGb2N1c2VkO1xubW9kdWxlLmV4cG9ydHMuaGFzVG91Y2hFdmVudHMgPSBoYXNUb3VjaEV2ZW50cztcbm1vZHVsZS5leHBvcnRzLmluamVjdENTUyA9IGluamVjdENTUztcbm1vZHVsZS5leHBvcnRzLmVzY2FwZSA9IGVzY2FwZTtcbiIsInZhciBzZXR0aW5nc19sb2NhbCA9IHt9O1xudHJ5IHtcbiAgc2V0dGluZ3NfbG9jYWwgPSByZXF1aXJlKCcuL3NldHRpbmdzX2xvY2FsLmpzJyk7XG59IGNhdGNoIChlKSB7XG59XG5cbnZhciBzZXR0aW5ncyA9IHtcbiAgQVBJX1VSTDogJ2h0dHA6Ly9sb2NhbGhvc3Q6NTAwMCcsICAvLyBUaGlzIFVSTCB0byB0aGUgR2FsYXh5IEFQSS4gTm8gdHJhaWxpbmcgc2xhc2guXG4gIERFQlVHOiBmYWxzZSxcbiAgUEVFUkpTX0tFWTogJycsICAvLyBTaWduIHVwIGZvciBhIGtleSBhdCBodHRwOi8vcGVlcmpzLmNvbS9wZWVyc2VydmVyXG4gIFZFUlNJT046ICcwLjAuMScgIC8vIFZlcnNpb24gb2YgdGhlIGBnYW1lcGFkLmpzYCBzY3JpcHRcbn07XG5cbmZvciAodmFyIGtleSBpbiBzZXR0aW5nc19sb2NhbCkge1xuICBzZXR0aW5nc1trZXldID0gc2V0dGluZ3NfbG9jYWxba2V5XTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBzZXR0aW5ncztcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBERUJVRzogdHJ1ZSxcbiAgUEVFUkpTX0tFWTogJ3JvdnU1eG1xbzY5d3dtaSdcbn07XG4iXX0=
