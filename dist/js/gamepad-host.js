!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.gamepad=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (window, document) {
'use strict';

// var peer = require('./lib/peer');
// var Promise = require('./lib/promise-1.0.0.js');  // jshint ignore:line
var Modal = require('./lib/modal');
var settings = require('./settings');
var utils = require('./lib/utils');
var error = utils.error;
var trace = utils.trace;


utils.polyfill(window);


var _instance;
var GAMEPAD_DEFAULT_OPTIONS = {
  // Which transport protocol to try first (choices: 'webrtc' or 'websocket').
  protocol: 'webrtc'
};

var gamepad = {
  get: function () {
    return _instance;
  },
  init: function (protocol) {
    return _instance || new Gamepad({
      protocol: protocol
    });
  }
};


/**
 * A library for controlling an HTML5 game using WebRTC or WebSocket.
 *
 * @param {String} opts Options for gamepad (e.g., protocol).
 * @exports gamepad
 * @namespace gamepad
 */
function Gamepad(opts) {
  _instance = this;

  if (!opts) {
    opts = {};
  }

  // Set properties based on options passed in, using defaults if missing.
  Object.keys(GAMEPAD_DEFAULT_OPTIONS).forEach(function (key) {
    this[key] = key in opts ? opts[key] : GAMEPAD_DEFAULT_OPTIONS[key];
  }.bind(this));

  this.listeners = {};
  this.state = {};
}


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
        switch (data.type) {
          case 'state':
            gamepad._updateState(data.data);
            break;
          default:
            console.warn('WebRTC message received of unknown type: "' + data.type + '"');
            break;
        }

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
        '<div class="modal-inner modal-pair">' +
          '<h2>URL</h2><p><a href="' + pairUrl + '" class="pair-url" target="_blank">' + pairUrl + '</a></p>' +
          '<h2>Code</h2><p class="pair-code">' + pairIdEsc + '</p>' +
        '</div>'
      );

      var modal = new Modal({
        id: 'pairing-screen',
        classes: 'slim',
        title: 'Pair your mobile phone',
        content: content
      }, true);

      // todo: replace `setTimeout`s with `transitionend` event listeners.
      window.setTimeout(function () {
        // Waiting for the transition to end.
        modal.open();
      }, 150);

      [
        'https://fonts.googleapis.com/css?family=Source+Sans+Pro:300,400,700',
        '/css/modal.css'  // todo: do not hardcode absolute path
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


gamepad._updateState = function (data) {
 Object.keys(data || {}).forEach(function (key) {
   if (!this.state[key] && data[key]) {
     // Button pushed.
     gamepad._emit('buttondown', key);
     gamepad._emit('buttondown.' + key, key);
   } else if (this.state[key] && !data[key]) {
     // Button released.
     gamepad._emit('buttonup', key);
     gamepad._emit('buttonup.' + key, key);
   }
 }.bind(this));
};


gamepad.hidePairingScreen = function () {
  Modal.closeAll();
};


/**
 * Fires an internal event with given data.
 *
 * @method _fire
 * @param {String} eventName Name of event to fire (e.g., `buttondown`).
 * @param {*} data Data to pass to the listener.
 * @private
 */
gamepad._emit = function (eventName, data) {
  (this.listeners[eventName] || []).forEach(function (listener) {
    listener.apply(listener, [data]);
  });
};


/**
 * Binds a listener to a gamepad event.
 *
 * @method bind
 * @param {String} eventName Event to bind to (e.g., `buttondown`).
 * @param {Function} listener Listener to call when given event occurs.
 * @return {Gamepad} Self
 */
gamepad._bind = function (eventName, listener) {
  if (typeof(this.listeners[event]) === 'undefined') {
    this.listeners[event] = [];
  }

  this.listeners[event].push(listener);

  return this;
};


/**
 * Removes listener of given type.
 *
 * If no type is given, all listeners are removed. If no listener is given, all
 * listeners of given type are removed.
 *
 * @method unbind
 * @param {String} eventName Type of listener to remove.
 * @param {Function} listener (Optional) The listener function to remove.
 * @return {Boolean} Was unbinding the listener successful.
 */
Gamepad.prototype.unbind = function (eventName, listener) {
  // Remove everything for all event types.
  if (typeof eventName === 'undefined') {
    this.listeners = {};
    return;
  }

  // Remove all listener functions for that event type.
  if (typeof listener === 'undefined') {
    this.listeners[eventName] = [];
    return;
  }

  if (typeof this.listeners[eventName] === 'undefined') {
    return false;
  }

  this.listeners[eventName].forEach(function (value, idx) {
    // Remove only the listener function passed to this method.
    if (value === listener) {
      this.listeners[eventName].splice(idx, 1);
      return true;
    }
  });

  return false;
};



// todo: these are mapped directly to NES controller. fix this.
gamepad.buttons = {
  a: {
    clicked: gamepad._bind
  }
};


gamepad.version = settings.VERSION;


var galaxyOrigin = window.location.origin;
var dataOrigin = document.querySelector('[data-galaxy-origin]');
if (dataOrigin) {
  gamepad.galaxyOrigin = dataOrigin.dataset.galaxyOrigin;
}


module.exports = gamepad;

})(window, document);

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
  d.style.display = 'none';
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
  this.el.style.display = 'block';

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


function polyfill(win) {
  if (!('performance' in win)) {
    win.performance = {
      now: function () {
        return +new Date();
      }
    };
  }

  if (('origin' in win.location)) {
    win.location.origin = win.location.protocol + '//' + win.location.host;
  }
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

function isFullScreen() {
  return (!document.fullscreenElement &&  // standard method
    !document.mozFullScreenElement &&
    !document.webkitFullscreenElement &&
    !document.msFullscreenElement);  // vendor-prefixed methods
}

function toggleFullScreen() {
  if (isFullScreen()) {
    trace('Entering full screen');
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (document.documentElement.msRequestFullscreen) {
      document.documentElement.msRequestFullscreen();
    }
  } else {
    trace('Exiting full screen');
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}


function lockOrientation() {
  var lo = (screen.LockOrientation ||
    screen.mozLockOrientation ||
    screen.webkitLockOrientation ||
    screen.msLockOrientation);
  if (!lo) {
    return warn('Orientation could not be locked');
  }

  lo(orientation);
}


function triggerEvent(type) {
  var event = document.createEvent('HTMLEvents');
  event.initEvent(type, true, true);
  event.eventName = type;
  (document.body || window).dispatchEvent(event);
}


module.exports.trace = trace;
module.exports.error = error;
module.exports.warn = warn;
module.exports.polyfill = polyfill;
module.exports.getPeerId = getPeerId;
module.exports.fieldFocused = fieldFocused;
module.exports.hasTouchEvents = hasTouchEvents;
module.exports.injectCSS = injectCSS;
module.exports.escape = escape;
module.exports.isFullScreen = isFullScreen;
module.exports.toggleFullScreen = toggleFullScreen;
module.exports.lockOrientation = lockOrientation;
module.exports.triggerEvent = triggerEvent;

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9vcHQvZ2FsYXh5LmpzLW1vYmlsZS1nYW1lcGFkL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL3NyYy9qcy9ob3N0LmpzIiwiL29wdC9nYWxheHkuanMtbW9iaWxlLWdhbWVwYWQvc3JjL2pzL2xpYi9tb2RhbC5qcyIsIi9vcHQvZ2FsYXh5LmpzLW1vYmlsZS1nYW1lcGFkL3NyYy9qcy9saWIvdXRpbHMuanMiLCIvb3B0L2dhbGF4eS5qcy1tb2JpbGUtZ2FtZXBhZC9zcmMvanMvc2V0dGluZ3MuanMiLCIvb3B0L2dhbGF4eS5qcy1tb2JpbGUtZ2FtZXBhZC9zcmMvanMvc2V0dGluZ3NfbG9jYWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uICh3aW5kb3csIGRvY3VtZW50KSB7XG4ndXNlIHN0cmljdCc7XG5cbi8vIHZhciBwZWVyID0gcmVxdWlyZSgnLi9saWIvcGVlcicpO1xuLy8gdmFyIFByb21pc2UgPSByZXF1aXJlKCcuL2xpYi9wcm9taXNlLTEuMC4wLmpzJyk7ICAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbnZhciBNb2RhbCA9IHJlcXVpcmUoJy4vbGliL21vZGFsJyk7XG52YXIgc2V0dGluZ3MgPSByZXF1aXJlKCcuL3NldHRpbmdzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuL2xpYi91dGlscycpO1xudmFyIGVycm9yID0gdXRpbHMuZXJyb3I7XG52YXIgdHJhY2UgPSB1dGlscy50cmFjZTtcblxuXG51dGlscy5wb2x5ZmlsbCh3aW5kb3cpO1xuXG5cbnZhciBfaW5zdGFuY2U7XG52YXIgR0FNRVBBRF9ERUZBVUxUX09QVElPTlMgPSB7XG4gIC8vIFdoaWNoIHRyYW5zcG9ydCBwcm90b2NvbCB0byB0cnkgZmlyc3QgKGNob2ljZXM6ICd3ZWJydGMnIG9yICd3ZWJzb2NrZXQnKS5cbiAgcHJvdG9jb2w6ICd3ZWJydGMnXG59O1xuXG52YXIgZ2FtZXBhZCA9IHtcbiAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIF9pbnN0YW5jZTtcbiAgfSxcbiAgaW5pdDogZnVuY3Rpb24gKHByb3RvY29sKSB7XG4gICAgcmV0dXJuIF9pbnN0YW5jZSB8fCBuZXcgR2FtZXBhZCh7XG4gICAgICBwcm90b2NvbDogcHJvdG9jb2xcbiAgICB9KTtcbiAgfVxufTtcblxuXG4vKipcbiAqIEEgbGlicmFyeSBmb3IgY29udHJvbGxpbmcgYW4gSFRNTDUgZ2FtZSB1c2luZyBXZWJSVEMgb3IgV2ViU29ja2V0LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRzIE9wdGlvbnMgZm9yIGdhbWVwYWQgKGUuZy4sIHByb3RvY29sKS5cbiAqIEBleHBvcnRzIGdhbWVwYWRcbiAqIEBuYW1lc3BhY2UgZ2FtZXBhZFxuICovXG5mdW5jdGlvbiBHYW1lcGFkKG9wdHMpIHtcbiAgX2luc3RhbmNlID0gdGhpcztcblxuICBpZiAoIW9wdHMpIHtcbiAgICBvcHRzID0ge307XG4gIH1cblxuICAvLyBTZXQgcHJvcGVydGllcyBiYXNlZCBvbiBvcHRpb25zIHBhc3NlZCBpbiwgdXNpbmcgZGVmYXVsdHMgaWYgbWlzc2luZy5cbiAgT2JqZWN0LmtleXMoR0FNRVBBRF9ERUZBVUxUX09QVElPTlMpLmZvckVhY2goZnVuY3Rpb24gKGtleSkge1xuICAgIHRoaXNba2V5XSA9IGtleSBpbiBvcHRzID8gb3B0c1trZXldIDogR0FNRVBBRF9ERUZBVUxUX09QVElPTlNba2V5XTtcbiAgfS5iaW5kKHRoaXMpKTtcblxuICB0aGlzLmxpc3RlbmVycyA9IHt9O1xuICB0aGlzLnN0YXRlID0ge307XG59XG5cblxuLyoqXG4gKiBEb2VzIGEgaGFuZHNoYWtlIHdpdGggUGVlckpTJyBXZWJTb2NrZXQgc2VydmVyIHRvIGdldCBhIHBlZXIgSUQuXG4gKlxuICogT25jZSB3ZSBoYXZlIHRoZSBwZWVyIElELCB3ZSBjYW4gdGVsbCB0aGUgY29udHJvbGxlciBob3cgdG8gZmluZCB1cy4gVGhlblxuICogYWxsIGNvbW11bmljYXRpb24gYmV0d2VlbiB0aGUgaG9zdCBhbmQgdGhlIGNvbnRyb2xsZXIgaXMgcGVlci10by1wZWVyIHZpYVxuICogV2ViUlRDIGRhdGEgY2hhbm5lbHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHBlZXJJZCBUaGUgcGVlciBJRC5cbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICogQG1lbWJlck9mIGdhbWVwYWRcbiAqL1xuZ2FtZXBhZC5wZWVySGFuZHNoYWtlID0gZnVuY3Rpb24gKHBlZXJJZCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIGlmICghcGVlcklkKSB7XG4gICAgICBwZWVySWQgPSB1dGlscy5nZXRQZWVySWQoKTsgIC8vIFRoZSBob3N0IElELlxuICAgIH1cblxuICAgIHZhciBwZWVyID0gbmV3IFBlZXIocGVlcklkLCB7XG4gICAgICBrZXk6IHNldHRpbmdzLlBFRVJKU19LRVksXG4gICAgICBkZWJ1Zzogc2V0dGluZ3MuREVCVUcgPyAzIDogMFxuICAgIH0pO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHBlZXIuZGVzdHJveSgpO1xuICAgIH0pO1xuXG4gICAgcGVlci5vbignb3BlbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgIHRyYWNlKCdNeSBwZWVyIElEOiAnICsgcGVlci5pZCk7XG4gICAgICByZXNvbHZlKHBlZXIpO1xuICAgIH0pO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBMaXN0ZW5zIGZvciBhIHBlZXIgY29ubmVjdGlvbiB3aXRoIHRoZSBjb250cm9sbGVyIHZpYSBXZWJSVEMgZGF0YSBjaGFubmVscy5cbiAqXG4gKiBJZiBvbmUgaXMgZ2l2ZW4sIHdlIHdpbGwgdGVsbCBQZWVySlMgdG8gdXNlIHRoZSBwZWVyIElEIHRoZSBxdWVyeS1zdHJpbmcuXG4gKlxuICogQHJldHVybnMge1Byb21pc2V9XG4gKiBAbWVtYmVyT2YgZ2FtZXBhZFxuICovXG5nYW1lcGFkLnBlZXJDb25uZWN0ID0gZnVuY3Rpb24gKHBlZXIpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICBwZWVyLm9uKCdjb25uZWN0aW9uJywgZnVuY3Rpb24gKGNvbm4pIHtcbiAgICAgIGNvbm4ub24oJ2RhdGEnLCBmdW5jdGlvbiAoZGF0YSkge1xuICAgICAgICBzd2l0Y2ggKGRhdGEudHlwZSkge1xuICAgICAgICAgIGNhc2UgJ3N0YXRlJzpcbiAgICAgICAgICAgIGdhbWVwYWQuX3VwZGF0ZVN0YXRlKGRhdGEuZGF0YSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdXZWJSVEMgbWVzc2FnZSByZWNlaXZlZCBvZiB1bmtub3duIHR5cGU6IFwiJyArIGRhdGEudHlwZSArICdcIicpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICB0cmFjZSgnUmVjZWl2ZWQ6ICcgKyAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkoZGF0YSkgOiAnJykpO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbm4ub24oJ2Vycm9yJywgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBlcnJvcihlcnIubWVzc2FnZSk7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFdlJ3ZlIGNvbm5lY3RlZCB0byBhIGNvbnRyb2xsZXIuXG4gICAgICByZXNvbHZlKGNvbm4pO1xuICAgIH0pO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBDb25uZWN0cyB0byBhIHBlZXIgKGNvbnRyb2xsZXIpLlxuICpcbiAqIEVzdGFibGlzaGVzIGNvbm5lY3Rpb24gd2l0aCBwZWVyLlxuICpcbiAqIEByZXR1cm5zIHtQcm9taXNlfVxuICogQG1lbWJlck9mIGdhbWVwYWRcbiAqL1xuZ2FtZXBhZC5wYWlyID0gZnVuY3Rpb24gKHBlZXJJZCkge1xuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcblxuICAgIHJldHVybiBnYW1lcGFkLnBlZXJIYW5kc2hha2UocGVlcklkKS50aGVuKGZ1bmN0aW9uIChwZWVyKSB7XG4gICAgICB2YXIgcGFpcklkID0gcGVlci5pZDsgIC8vIFRoaXMgc2hvdWxkIGJlIHRoZSBzYW1lIGFzIGBwZWVySWRgLCBidXQgdGhpcyBjb21lcyBmcm9tIFBlZXJKUywgd2hpY2ggaXMgdGhlIHNvdXJjZSBvZiB0cnV0aC5cbiAgICAgIHZhciBwYWlySWRFc2MgPSBlbmNvZGVVUklDb21wb25lbnQocGFpcklkKTtcbiAgICAgIHZhciBwYWlyVXJsID0gZ2FsYXh5T3JpZ2luICsgJy9jbGllbnQuaHRtbD8nICsgcGFpcklkRXNjO1xuXG4gICAgICAvLyBVcGRhdGUgdGhlIHF1ZXJ5c3RyaW5nIGluIHRoZSBhZGRyZXNzIGJhci5cbiAgICAgIHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZShudWxsLCBudWxsLCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnPycgKyBwYWlySWRFc2MpO1xuXG4gICAgICB2YXIgY29udGVudCA9IChcbiAgICAgICAgJzxkaXYgY2xhc3M9XCJtb2RhbC1pbm5lciBtb2RhbC1wYWlyXCI+JyArXG4gICAgICAgICAgJzxoMj5VUkw8L2gyPjxwPjxhIGhyZWY9XCInICsgcGFpclVybCArICdcIiBjbGFzcz1cInBhaXItdXJsXCIgdGFyZ2V0PVwiX2JsYW5rXCI+JyArIHBhaXJVcmwgKyAnPC9hPjwvcD4nICtcbiAgICAgICAgICAnPGgyPkNvZGU8L2gyPjxwIGNsYXNzPVwicGFpci1jb2RlXCI+JyArIHBhaXJJZEVzYyArICc8L3A+JyArXG4gICAgICAgICc8L2Rpdj4nXG4gICAgICApO1xuXG4gICAgICB2YXIgbW9kYWwgPSBuZXcgTW9kYWwoe1xuICAgICAgICBpZDogJ3BhaXJpbmctc2NyZWVuJyxcbiAgICAgICAgY2xhc3NlczogJ3NsaW0nLFxuICAgICAgICB0aXRsZTogJ1BhaXIgeW91ciBtb2JpbGUgcGhvbmUnLFxuICAgICAgICBjb250ZW50OiBjb250ZW50XG4gICAgICB9LCB0cnVlKTtcblxuICAgICAgLy8gdG9kbzogcmVwbGFjZSBgc2V0VGltZW91dGBzIHdpdGggYHRyYW5zaXRpb25lbmRgIGV2ZW50IGxpc3RlbmVycy5cbiAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gV2FpdGluZyBmb3IgdGhlIHRyYW5zaXRpb24gdG8gZW5kLlxuICAgICAgICBtb2RhbC5vcGVuKCk7XG4gICAgICB9LCAxNTApO1xuXG4gICAgICBbXG4gICAgICAgICdodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9U291cmNlK1NhbnMrUHJvOjMwMCw0MDAsNzAwJyxcbiAgICAgICAgJy9jc3MvbW9kYWwuY3NzJyAgLy8gdG9kbzogZG8gbm90IGhhcmRjb2RlIGFic29sdXRlIHBhdGhcbiAgICAgIF0uZm9yRWFjaChmdW5jdGlvbiAoc3R5bGVzaGVldCkge1xuICAgICAgICB1dGlscy5pbmplY3RDU1Moe2hyZWY6IHN0eWxlc2hlZXR9KTtcbiAgICAgIH0pO1xuXG4gICAgICBnYW1lcGFkLnBlZXJDb25uZWN0KHBlZXIpLnRoZW4oZnVuY3Rpb24gKGNvbm4pIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1BlZXIgY29ubmVjdGVkJyk7XG4gICAgICAgIG1vZGFsLmNsb3NlKCk7XG4gICAgICAgIHJlc29sdmUoY29ubik7XG4gICAgICB9KTtcblxuICAgIH0pLmNhdGNoKGNvbnNvbGUuZXJyb3IuYmluZChjb25zb2xlKSk7XG4gIH0pO1xufTtcblxuXG5nYW1lcGFkLl91cGRhdGVTdGF0ZSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gT2JqZWN0LmtleXMoZGF0YSB8fCB7fSkuZm9yRWFjaChmdW5jdGlvbiAoa2V5KSB7XG4gICBpZiAoIXRoaXMuc3RhdGVba2V5XSAmJiBkYXRhW2tleV0pIHtcbiAgICAgLy8gQnV0dG9uIHB1c2hlZC5cbiAgICAgZ2FtZXBhZC5fZW1pdCgnYnV0dG9uZG93bicsIGtleSk7XG4gICAgIGdhbWVwYWQuX2VtaXQoJ2J1dHRvbmRvd24uJyArIGtleSwga2V5KTtcbiAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZVtrZXldICYmICFkYXRhW2tleV0pIHtcbiAgICAgLy8gQnV0dG9uIHJlbGVhc2VkLlxuICAgICBnYW1lcGFkLl9lbWl0KCdidXR0b251cCcsIGtleSk7XG4gICAgIGdhbWVwYWQuX2VtaXQoJ2J1dHRvbnVwLicgKyBrZXksIGtleSk7XG4gICB9XG4gfS5iaW5kKHRoaXMpKTtcbn07XG5cblxuZ2FtZXBhZC5oaWRlUGFpcmluZ1NjcmVlbiA9IGZ1bmN0aW9uICgpIHtcbiAgTW9kYWwuY2xvc2VBbGwoKTtcbn07XG5cblxuLyoqXG4gKiBGaXJlcyBhbiBpbnRlcm5hbCBldmVudCB3aXRoIGdpdmVuIGRhdGEuXG4gKlxuICogQG1ldGhvZCBfZmlyZVxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50TmFtZSBOYW1lIG9mIGV2ZW50IHRvIGZpcmUgKGUuZy4sIGBidXR0b25kb3duYCkuXG4gKiBAcGFyYW0geyp9IGRhdGEgRGF0YSB0byBwYXNzIHRvIHRoZSBsaXN0ZW5lci5cbiAqIEBwcml2YXRlXG4gKi9cbmdhbWVwYWQuX2VtaXQgPSBmdW5jdGlvbiAoZXZlbnROYW1lLCBkYXRhKSB7XG4gICh0aGlzLmxpc3RlbmVyc1tldmVudE5hbWVdIHx8IFtdKS5mb3JFYWNoKGZ1bmN0aW9uIChsaXN0ZW5lcikge1xuICAgIGxpc3RlbmVyLmFwcGx5KGxpc3RlbmVyLCBbZGF0YV0pO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBCaW5kcyBhIGxpc3RlbmVyIHRvIGEgZ2FtZXBhZCBldmVudC5cbiAqXG4gKiBAbWV0aG9kIGJpbmRcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudE5hbWUgRXZlbnQgdG8gYmluZCB0byAoZS5nLiwgYGJ1dHRvbmRvd25gKS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIExpc3RlbmVyIHRvIGNhbGwgd2hlbiBnaXZlbiBldmVudCBvY2N1cnMuXG4gKiBAcmV0dXJuIHtHYW1lcGFkfSBTZWxmXG4gKi9cbmdhbWVwYWQuX2JpbmQgPSBmdW5jdGlvbiAoZXZlbnROYW1lLCBsaXN0ZW5lcikge1xuICBpZiAodHlwZW9mKHRoaXMubGlzdGVuZXJzW2V2ZW50XSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdGhpcy5saXN0ZW5lcnNbZXZlbnRdID0gW107XG4gIH1cblxuICB0aGlzLmxpc3RlbmVyc1tldmVudF0ucHVzaChsaXN0ZW5lcik7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5cbi8qKlxuICogUmVtb3ZlcyBsaXN0ZW5lciBvZiBnaXZlbiB0eXBlLlxuICpcbiAqIElmIG5vIHR5cGUgaXMgZ2l2ZW4sIGFsbCBsaXN0ZW5lcnMgYXJlIHJlbW92ZWQuIElmIG5vIGxpc3RlbmVyIGlzIGdpdmVuLCBhbGxcbiAqIGxpc3RlbmVycyBvZiBnaXZlbiB0eXBlIGFyZSByZW1vdmVkLlxuICpcbiAqIEBtZXRob2QgdW5iaW5kXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnROYW1lIFR5cGUgb2YgbGlzdGVuZXIgdG8gcmVtb3ZlLlxuICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgKE9wdGlvbmFsKSBUaGUgbGlzdGVuZXIgZnVuY3Rpb24gdG8gcmVtb3ZlLlxuICogQHJldHVybiB7Qm9vbGVhbn0gV2FzIHVuYmluZGluZyB0aGUgbGlzdGVuZXIgc3VjY2Vzc2Z1bC5cbiAqL1xuR2FtZXBhZC5wcm90b3R5cGUudW5iaW5kID0gZnVuY3Rpb24gKGV2ZW50TmFtZSwgbGlzdGVuZXIpIHtcbiAgLy8gUmVtb3ZlIGV2ZXJ5dGhpbmcgZm9yIGFsbCBldmVudCB0eXBlcy5cbiAgaWYgKHR5cGVvZiBldmVudE5hbWUgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdGhpcy5saXN0ZW5lcnMgPSB7fTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIGxpc3RlbmVyIGZ1bmN0aW9ucyBmb3IgdGhhdCBldmVudCB0eXBlLlxuICBpZiAodHlwZW9mIGxpc3RlbmVyID09PSAndW5kZWZpbmVkJykge1xuICAgIHRoaXMubGlzdGVuZXJzW2V2ZW50TmFtZV0gPSBbXTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodHlwZW9mIHRoaXMubGlzdGVuZXJzW2V2ZW50TmFtZV0gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgdGhpcy5saXN0ZW5lcnNbZXZlbnROYW1lXS5mb3JFYWNoKGZ1bmN0aW9uICh2YWx1ZSwgaWR4KSB7XG4gICAgLy8gUmVtb3ZlIG9ubHkgdGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHBhc3NlZCB0byB0aGlzIG1ldGhvZC5cbiAgICBpZiAodmFsdWUgPT09IGxpc3RlbmVyKSB7XG4gICAgICB0aGlzLmxpc3RlbmVyc1tldmVudE5hbWVdLnNwbGljZShpZHgsIDEpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gZmFsc2U7XG59O1xuXG5cblxuLy8gdG9kbzogdGhlc2UgYXJlIG1hcHBlZCBkaXJlY3RseSB0byBORVMgY29udHJvbGxlci4gZml4IHRoaXMuXG5nYW1lcGFkLmJ1dHRvbnMgPSB7XG4gIGE6IHtcbiAgICBjbGlja2VkOiBnYW1lcGFkLl9iaW5kXG4gIH1cbn07XG5cblxuZ2FtZXBhZC52ZXJzaW9uID0gc2V0dGluZ3MuVkVSU0lPTjtcblxuXG52YXIgZ2FsYXh5T3JpZ2luID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbjtcbnZhciBkYXRhT3JpZ2luID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtZ2FsYXh5LW9yaWdpbl0nKTtcbmlmIChkYXRhT3JpZ2luKSB7XG4gIGdhbWVwYWQuZ2FsYXh5T3JpZ2luID0gZGF0YU9yaWdpbi5kYXRhc2V0LmdhbGF4eU9yaWdpbjtcbn1cblxuXG5tb2R1bGUuZXhwb3J0cyA9IGdhbWVwYWQ7XG5cbn0pKHdpbmRvdywgZG9jdW1lbnQpO1xuIiwidmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xuXG5cbmZ1bmN0aW9uIE1vZGFsKG9wdHMsIGluamVjdCkge1xuICAvLyBDcmVhdGUgcHJvcGVydGllcyBmb3IgYGlkYCwgYGNsYXNzZXNgLCBgdGl0bGVgLCBhbmQgYGNvbnRlbnRgLlxuICBPYmplY3Qua2V5cyhvcHRzKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICB0aGlzW2tleV0gPSBvcHRzW2tleV07XG4gIH0uYmluZCh0aGlzKSk7XG5cbiAgaWYgKGluamVjdCkge1xuICAgIHRoaXMuaW5qZWN0KCk7XG4gIH1cbn1cblxuTW9kYWwuY2xvc2VBbGwgPSBNb2RhbC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENsb3NlIGFueSBvcGVuIG1vZGFsLlxuICB2YXIgb3BlbmVkTW9kYWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWQtc2hvdycpO1xuICBpZiAob3BlbmVkTW9kYWwpIHtcbiAgICBvcGVuZWRNb2RhbC5jbGFzc0xpc3QucmVtb3ZlKCdtZC1zaG93Jyk7XG4gIH1cbiAgLy8gVE9ETzogV2FpdCB1bnRpbCB0cmFuc2l0aW9uIGVuZC5cbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdnYWxheHktb3ZlcmxheWVkJyk7XG4gIH0sIDE1MCk7XG59O1xuXG5Nb2RhbC5pbmplY3RPdmVybGF5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBJbmplY3QgdGhlIG92ZXJsYXkgd2UgdXNlIGZvciBvdmVybGF5aW5nIGl0IGJlaGluZCBtb2RhbHMuXG4gIGlmICghZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1kLW92ZXJsYXknKSkge1xuICAgIHZhciBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZC5jbGFzc05hbWUgPSAnbWQtb3ZlcmxheSc7XG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChkKTtcbiAgfVxufTtcblxuTW9kYWwucHJvdG90eXBlLmh0bWwgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIGQuaWQgPSAnbW9kYWwtJyArIHRoaXMuaWQ7XG4gIGQuY2xhc3NOYW1lID0gJ21kLW1vZGFsIG1kLWVmZmVjdC0xICcgKyAodGhpcy5jbGFzc2VzIHx8ICcnKTtcbiAgZC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICBkLmlubmVySFRNTCA9IChcbiAgICAnPGRpdiBjbGFzcz1cIm1kLWNvbnRlbnRcIj4nICtcbiAgICAgICc8aDM+JyArIHV0aWxzLmVzY2FwZSh0aGlzLnRpdGxlKSArICc8L2gzPiAnICtcbiAgICAgICc8YSBjbGFzcz1cIm1kLWNsb3NlXCIgdGl0bGU9XCJDbG9zZVwiPjxzcGFuPjxkaXY+Q2xvc2U8L2Rpdj48L3NwYW4+PC9hPicgK1xuICAgICAgJzxkaXY+JyArIHRoaXMuY29udGVudCArICc8L2Rpdj4nICtcbiAgICAnPC9kaXY+J1xuICApO1xuICByZXR1cm4gZDtcbn07XG5cbk1vZGFsLnByb3RvdHlwZS5pbmplY3QgPSBmdW5jdGlvbiAoKSB7XG4gIE1vZGFsLmluamVjdE92ZXJsYXkoKTtcblxuICB0aGlzLmVsID0gdGhpcy5odG1sKCk7XG4gIHRoaXMuZWwuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmVsKTtcbiAgZG9jdW1lbnQuYm9keS5jbGFzc0xpc3QuYWRkKCdnYWxheHktb3ZlcmxheWVkJyk7XG5cbiAgcmV0dXJuIHRoaXMuZWw7XG59O1xuXG5Nb2RhbC5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5lbC5jbGFzc0xpc3QuYWRkKCdtZC1zaG93Jyk7XG59O1xuXG5cbm1vZHVsZS5leHBvcnRzID0gTW9kYWw7XG4iLCJmdW5jdGlvbiB0cmFjZSh0ZXh0LCBsZXZlbCkge1xuICBjb25zb2xlW2xldmVsIHx8ICdsb2cnXSgod2luZG93LnBlcmZvcm1hbmNlLm5vdygpIC8gMTAwMCkudG9GaXhlZCgzKSArICc6ICcgKyB0ZXh0KTtcbn1cblxuXG5mdW5jdGlvbiBlcnJvcih0ZXh0KSB7XG4gIHJldHVybiB0cmFjZSh0ZXh0LCAnZXJyb3InKTtcbn1cblxuXG5mdW5jdGlvbiB3YXJuKHRleHQpIHtcbiAgcmV0dXJuIHRyYWNlKHRleHQsICd3YXJuJyk7XG59XG5cblxuZnVuY3Rpb24gcG9seWZpbGwod2luKSB7XG4gIGlmICghKCdwZXJmb3JtYW5jZScgaW4gd2luKSkge1xuICAgIHdpbi5wZXJmb3JtYW5jZSA9IHtcbiAgICAgIG5vdzogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gK25ldyBEYXRlKCk7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGlmICgoJ29yaWdpbicgaW4gd2luLmxvY2F0aW9uKSkge1xuICAgIHdpbi5sb2NhdGlvbi5vcmlnaW4gPSB3aW4ubG9jYXRpb24ucHJvdG9jb2wgKyAnLy8nICsgd2luLmxvY2F0aW9uLmhvc3Q7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBnZXRQZWVySWQoKSB7XG4gIHJldHVybiAod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLmluZGV4T2YoJy5odG1sJykgP1xuICAgIHdpbmRvdy5sb2NhdGlvbi5zZWFyY2guc3Vic3RyKDEpIDogd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnN1YnN0cigxKSk7XG59XG5cblxudmFyIEZJRUxEX0ZPQ1VTRURfVEFHUyA9IFtcbiAgJ2lucHV0JyxcbiAgJ2tleWdlbicsXG4gICdtZXRlcicsXG4gICdvcHRpb24nLFxuICAnb3V0cHV0JyxcbiAgJ3Byb2dyZXNzJyxcbiAgJ3NlbGVjdCcsXG4gICd0ZXh0YXJlYSdcbl07XG5mdW5jdGlvbiBmaWVsZEZvY3VzZWQoZSkge1xuICByZXR1cm4gRklFTERfRk9DVVNFRF9UQUdTLmluZGV4T2YoZS50YXJnZXQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSkgIT09IC0xO1xufVxuXG5cbmZ1bmN0aW9uIGhhc1RvdWNoRXZlbnRzKCkge1xuICByZXR1cm4gKCdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdyB8fFxuICAgIHdpbmRvdy5Eb2N1bWVudFRvdWNoICYmIGRvY3VtZW50IGluc3RhbmNlb2YgRG9jdW1lbnRUb3VjaCk7XG59XG5cbmZ1bmN0aW9uIGluamVjdENTUyhvcHRzKSB7XG4gIHZhciBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGluaycpO1xuICBsaW5rLmhyZWYgPSBvcHRzLmhyZWY7XG4gIGxpbmsubWVkaWEgPSAnYWxsJztcbiAgbGluay5yZWwgPSAnc3R5bGVzaGVldCc7XG4gIGxpbmsudHlwZSA9ICd0ZXh0L2Nzcyc7XG4gIE9iamVjdC5rZXlzKG9wdHMgfHwge30pLmZvckVhY2goZnVuY3Rpb24gKHByb3ApIHtcbiAgICBsaW5rW3Byb3BdID0gb3B0c1twcm9wXTtcbiAgfSk7XG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2hlYWQnKS5hcHBlbmRDaGlsZChsaW5rKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlKHRleHQpIHtcbiAgaWYgKCF0ZXh0KSB7XG4gICAgcmV0dXJuIHRleHQ7XG4gIH1cbiAgcmV0dXJuIHRleHQucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgICAgICAgICAgIC5yZXBsYWNlKC88L2csICcmbHQ7JylcbiAgICAgICAgICAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXG4gICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgJyYjMzk7JylcbiAgICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgJyYjMzQ7Jyk7XG59XG5cbmZ1bmN0aW9uIGlzRnVsbFNjcmVlbigpIHtcbiAgcmV0dXJuICghZG9jdW1lbnQuZnVsbHNjcmVlbkVsZW1lbnQgJiYgIC8vIHN0YW5kYXJkIG1ldGhvZFxuICAgICFkb2N1bWVudC5tb3pGdWxsU2NyZWVuRWxlbWVudCAmJlxuICAgICFkb2N1bWVudC53ZWJraXRGdWxsc2NyZWVuRWxlbWVudCAmJlxuICAgICFkb2N1bWVudC5tc0Z1bGxzY3JlZW5FbGVtZW50KTsgIC8vIHZlbmRvci1wcmVmaXhlZCBtZXRob2RzXG59XG5cbmZ1bmN0aW9uIHRvZ2dsZUZ1bGxTY3JlZW4oKSB7XG4gIGlmIChpc0Z1bGxTY3JlZW4oKSkge1xuICAgIHRyYWNlKCdFbnRlcmluZyBmdWxsIHNjcmVlbicpO1xuICAgIGlmIChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVxdWVzdEZ1bGxzY3JlZW4pIHtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5yZXF1ZXN0RnVsbHNjcmVlbigpO1xuICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50Lm1velJlcXVlc3RGdWxsU2NyZWVuKSB7XG4gICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQubW96UmVxdWVzdEZ1bGxTY3JlZW4oKTtcbiAgICB9IGVsc2UgaWYgKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC53ZWJraXRSZXF1ZXN0RnVsbHNjcmVlbikge1xuICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LndlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKEVsZW1lbnQuQUxMT1dfS0VZQk9BUkRfSU5QVVQpO1xuICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50Lm1zUmVxdWVzdEZ1bGxzY3JlZW4pIHtcbiAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5tc1JlcXVlc3RGdWxsc2NyZWVuKCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRyYWNlKCdFeGl0aW5nIGZ1bGwgc2NyZWVuJyk7XG4gICAgaWYgKGRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKSB7XG4gICAgICBkb2N1bWVudC5leGl0RnVsbHNjcmVlbigpO1xuICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQubW96Q2FuY2VsRnVsbFNjcmVlbikge1xuICAgICAgZG9jdW1lbnQubW96Q2FuY2VsRnVsbFNjcmVlbigpO1xuICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQud2Via2l0RXhpdEZ1bGxzY3JlZW4pIHtcbiAgICAgIGRvY3VtZW50LndlYmtpdEV4aXRGdWxsc2NyZWVuKCk7XG4gICAgfSBlbHNlIGlmIChkb2N1bWVudC5tc0V4aXRGdWxsc2NyZWVuKSB7XG4gICAgICBkb2N1bWVudC5tc0V4aXRGdWxsc2NyZWVuKCk7XG4gICAgfVxuICB9XG59XG5cblxuZnVuY3Rpb24gbG9ja09yaWVudGF0aW9uKCkge1xuICB2YXIgbG8gPSAoc2NyZWVuLkxvY2tPcmllbnRhdGlvbiB8fFxuICAgIHNjcmVlbi5tb3pMb2NrT3JpZW50YXRpb24gfHxcbiAgICBzY3JlZW4ud2Via2l0TG9ja09yaWVudGF0aW9uIHx8XG4gICAgc2NyZWVuLm1zTG9ja09yaWVudGF0aW9uKTtcbiAgaWYgKCFsbykge1xuICAgIHJldHVybiB3YXJuKCdPcmllbnRhdGlvbiBjb3VsZCBub3QgYmUgbG9ja2VkJyk7XG4gIH1cblxuICBsbyhvcmllbnRhdGlvbik7XG59XG5cblxuZnVuY3Rpb24gdHJpZ2dlckV2ZW50KHR5cGUpIHtcbiAgdmFyIGV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0hUTUxFdmVudHMnKTtcbiAgZXZlbnQuaW5pdEV2ZW50KHR5cGUsIHRydWUsIHRydWUpO1xuICBldmVudC5ldmVudE5hbWUgPSB0eXBlO1xuICAoZG9jdW1lbnQuYm9keSB8fCB3aW5kb3cpLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xufVxuXG5cbm1vZHVsZS5leHBvcnRzLnRyYWNlID0gdHJhY2U7XG5tb2R1bGUuZXhwb3J0cy5lcnJvciA9IGVycm9yO1xubW9kdWxlLmV4cG9ydHMud2FybiA9IHdhcm47XG5tb2R1bGUuZXhwb3J0cy5wb2x5ZmlsbCA9IHBvbHlmaWxsO1xubW9kdWxlLmV4cG9ydHMuZ2V0UGVlcklkID0gZ2V0UGVlcklkO1xubW9kdWxlLmV4cG9ydHMuZmllbGRGb2N1c2VkID0gZmllbGRGb2N1c2VkO1xubW9kdWxlLmV4cG9ydHMuaGFzVG91Y2hFdmVudHMgPSBoYXNUb3VjaEV2ZW50cztcbm1vZHVsZS5leHBvcnRzLmluamVjdENTUyA9IGluamVjdENTUztcbm1vZHVsZS5leHBvcnRzLmVzY2FwZSA9IGVzY2FwZTtcbm1vZHVsZS5leHBvcnRzLmlzRnVsbFNjcmVlbiA9IGlzRnVsbFNjcmVlbjtcbm1vZHVsZS5leHBvcnRzLnRvZ2dsZUZ1bGxTY3JlZW4gPSB0b2dnbGVGdWxsU2NyZWVuO1xubW9kdWxlLmV4cG9ydHMubG9ja09yaWVudGF0aW9uID0gbG9ja09yaWVudGF0aW9uO1xubW9kdWxlLmV4cG9ydHMudHJpZ2dlckV2ZW50ID0gdHJpZ2dlckV2ZW50O1xuIiwidmFyIHNldHRpbmdzX2xvY2FsID0ge307XG50cnkge1xuICBzZXR0aW5nc19sb2NhbCA9IHJlcXVpcmUoJy4vc2V0dGluZ3NfbG9jYWwuanMnKTtcbn0gY2F0Y2ggKGUpIHtcbn1cblxudmFyIHNldHRpbmdzID0ge1xuICBBUElfVVJMOiAnaHR0cDovL2xvY2FsaG9zdDo1MDAwJywgIC8vIFRoaXMgVVJMIHRvIHRoZSBHYWxheHkgQVBJLiBObyB0cmFpbGluZyBzbGFzaC5cbiAgREVCVUc6IGZhbHNlLFxuICBQRUVSSlNfS0VZOiAnJywgIC8vIFNpZ24gdXAgZm9yIGEga2V5IGF0IGh0dHA6Ly9wZWVyanMuY29tL3BlZXJzZXJ2ZXJcbiAgVkVSU0lPTjogJzAuMC4xJyAgLy8gVmVyc2lvbiBvZiB0aGUgYGdhbWVwYWQuanNgIHNjcmlwdFxufTtcblxuZm9yICh2YXIga2V5IGluIHNldHRpbmdzX2xvY2FsKSB7XG4gIHNldHRpbmdzW2tleV0gPSBzZXR0aW5nc19sb2NhbFtrZXldO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHNldHRpbmdzO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIERFQlVHOiB0cnVlLFxuICBQRUVSSlNfS0VZOiAncm92dTV4bXFvNjl3d21pJ1xufTtcbiJdfQ==
