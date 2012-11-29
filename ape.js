
var APE_PATH = "http://localhost/ape";
var FIREBASE_URL = "https://ape.firebaseIO.com";

function Ape(doc) {
  this._doc = doc;
  this._counter = 1000;
}
Ape.prototype = {
  _toSkipIfEmpty: {
    LINK: true,
    STYLE: true,
    HEAD: true,
    META: true,
    BODY: true,
    APPLET: true,
    BASE: true,
    BASEFONT: true,
    BDO: true,
    BR: true,
    OBJECT: true,
    TD: true,
    TR: true,
    TH: true,
    THEAD: true,
    TITLE: true
  },

  _toSkipAlways: {
    SCRIPT: true,
    NOSCRIPT: true
  },

  _makeId: function() {
    return "ape" + (this._counter++);
  },

  _skipElement: function(el) {
    if (this._toSkipAlways[el.tagName] || el.jsmirrorHide) {
      return true;
    }

    // Elements that can't be seen or are in the skipIfEmpty list.
    if ((el.style && el.style.display == "none") ||
        ((el.clientWidth === 0 && el.clientHeight === 0) &&
        (!this._toSkipIfEmpty[el.tagName]) &&
        (!el.childNodes.length))) {
      return true;
    }

    return false;
  },

  // Similar to BrowserMirror, each element is an object of the following form:
  // { self: {name: tagName, id: jsmirrorId, attributes: {...}}, children: [...] }
  _serializeElement: function(el) {
    if (!el.jsmirrorId) {
      el.jsmirrorId = this._makeId();
    }

    if (el.tagName == "CANVAS") {
      return {
        self: {
          name: "IMG",
          id: el.jsmirrorId,
          attributes: {src: el.toDataURL("image/png")}
        }
      };
    }

    if (el.tagName == "RAWSTRING") {
      return {
        self: {
          name: "RAWSTRING",
          id: el.jsmirrorId,
          value: el.value
        }
      };
    }

    var attrs = this._serializeAttributes(el);
    var children = this._serializeChildren(el);
    for (var i = 0; i < children.length; i++) {
      children[i] = this._serializeElement(children[i]);
    }

    var ret = {
      self: {
        name: el.tagName,
        id: el.jsmirrorId,
        attributes: attrs
      }
    };

    if (children && children.length) {
      ret.children = children;
    }

    return ret;
  },

  // Returns a dictionary of attributes with values.
  _serializeAttributes: function(el) {
    var attrs = {};
    if (el.attributes) {
      for (var i = 0; i < el.attributes.length; i++) {
        var name = el.attributes[i].name;
        if (name.substr(0, 2).toLowerCase() == "on") {
          // Event-based attributes are stripped out.
          continue;
        } else if (name == "href" || name == "src" || name == "value") {
          attrs[name] = el[name];
        } else {
          attrs[name] = el.attributes[i].nodeValue;
        }
      }
    }

    if (el.tagName == "TEXTAREA") {
      attrs.value = el.value;
    }
  
    return attrs;
  },

  // Returns an array of children, each item in the array is an element.
  _serializeChildren: function(el) {
    var ret = [];

    var children = el.childNodes;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (this._skipElement(child)) {
        continue;
      }
      if (child.nodeType == this._doc.TEXT_NODE) {
        var value = child.nodeValue;
        if (!value) {
          continue;
        }
        if (i && typeof ret[ret.length - 1] == "string") {
          ret[ret.length - 1].val += value;
        } else {
          ret.push({tagName: "RAWSTRING", value: value});
        }
      } else if (child.nodeType == this._doc.ELEMENT_NODE) {
        ret.push(child);
      }
    }

    return ret;
  },

  serializeDocument: function() {
    return {
      href: location.href,
      html: this._serializeAttributes(this._doc.childNodes[0]), // <html>
      head: this._serializeElement(this._doc.head), // <head>
      body: this._serializeElement(this._doc.body), // <body>
    };
  },

};

function ApeServer(cb) {
  if (typeof Firebase == "undefined") {
    throw new Error("Firebase not loaded, did you include the JS library?");
  }

  this._cb = cb;
  this._id = null;
  this._ape = null;
  this._base = null;

  this._init();
}
ApeServer.prototype = {
  _init: function() {
    // Try to get a unique session and initialize it.
    var self = this;
    var session = new Firebase(FIREBASE_URL + "/counter");
    session.transaction(function(val) {
      return val + 1;
    }, function(success, snapshot) {
      if (success) {
        self._id = snapshot.val();
        self._base = new Firebase(FIREBASE_URL + "/" + self._id);
        self._createSession();
      } else {
        throw new Error("Session transaction failed on Fireabse!");
      }
    });
  },

  _createSession: function() {
    if (!this._base) {
      throw new Error("Session not initialized!");
    }

    var self = this;
    this._ape = new Ape(document);

    // First time upload of document.
    this._base.set(this._ape.serializeDocument(), function(success) {
      if (success) {
        // Setup timer to watch for subsequent changes.
        self._cb(self._id);
        setInterval(function() {
          //
        }, 500);
      } else {
        self._cb();
      }
    });
  },

};

function ApeClient(id) {
  if (typeof Firebase == "undefined") {
    throw new Error("Firebase not loaded, did you include the JS library?");
  }

  this._base = new Firebase(FIREBASE_URL + "/" + id);
}
ApeClient.prototype = {
  start: function() {
    var self = this;
    this._base.on("value", function(snapshot) {
      // Works for both first time rendering and updates.
      self._renderDoc(snapshot.val());
    });
  },

  _renderDoc: function(doc) {
    if (!doc) {
      throw new Error("Empty document provided!");
    }

    this._setAttributes(document.childNodes[0], doc.html);
    this._setElement(document.head, doc.head);
    this._setBase(doc.href);
    this._setElement(document.body, doc.body);
  },

  _setElement: function(el, data) {
    if (el.tagName != data.self.name) {
      el.parentNode.replaceChild(this._deserializeElement(data), el);
      return;
    }

    if (data.self.name == "RAWSTRING") {
      if (el.nodeType != document.TEXT_NODE) {
        el.parentNode.replaceChild(
          document.createTextNode(data.self.value), el
        );
      } else {
        el.nodeValue = data.self.value;
      }
    }

    if (data.self.attributes) {
      this._setAttributes(el, data.self.attributes);
    }
    el.jsmirrorId = data.self.id;

    var children = data.children;
    if (!children || !children.length) {
      return;
    }

    var offset = 0;
    for (var i = 0; i < children.length; i++) {
      var childIndex = i + offset;
      var existing = el.childNodes[childIndex];
      if (!existing) {
        el.appendChild(this._deserializeElement(children[i]));
      } else if (existing.jsmirrorHide) {
        offset++;
        i--;
        continue;
      } else {
        this._setElement(existing, children[i]);
      }
    }

    if (el.childNodes) {
      while (el.childNodes.length - offset > children.length) {
        var node = el.childNodes[children.length + offset];
        if (node.jsmirrorHide) {
          offset++;
          continue;
        }
        el.removeChild(node);
      }
    }
  },

  _setAttributes: function(el, attrs) {
    if (!attrs || typeof attrs.hasOwnProperty != "function") {
      return;
    }

    var len = 0;
    for (var i in attrs) {
      if (!attrs.hasOwnProperty(i)) {
        continue;
      }
      len++;

      if (el.setAttribute) {
        el.setAttribute(i, attrs[i]);
      }
      if (i == "value") {
        el.value = attrs[i];
      }
    }

    if (el.attributes && (el.attributes.length > len)) {
      // There must be an extra attribute to be deleted.
      var toDelete = [];
      for (i = 0; i < el.attributes.length; i++) {
        if (!attrs.hasOwnProperty(el.attributes[i].name)) {
          toDelete.push(el.attributes[i].name);
        }
      }
      for (i = 0; i < toDelete.length; i++) {
        el.removeAttribute(toDelete[i]);
      }
    }
  },

  _setBase: function(href) {
    var existing = document.getElementsByTagName("base");
    for (var i = 0; i < existing.length; i++) {
      existing[i].parentNode.removeChild(existing[i]);
    }
    var base = document.createElement("base");
    base.href = href;
    document.head.appendChild(base);
  },

  _deserializeElement: function(data) {
    if (data.self.name == "RAWSTRING") {
      return document.createTextNode(data.self.value);
    }

    var el;
    var attrs = data.self.attributes;
    var children = data.children;

    el = document.createElement(data.self.name);
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i) && el.setAttribute) {
        el.setAttribute(i, attrs[i]);
      }
    }

    if (children) {
      for (var i = 0; i < children.length; i++) {
        var o = children[i];
        if (typeof o == "string") {
          el.appendChild(document.createTextNode(o));
        } else {
          el.appendChild(this._deserializeElement(o));
        }
      }
    }

    el.jsmirrorId = data.self.id;
    return el;
  },

};

function runServer() {
  // If Firebase isn't loaded, wait for a bit.
  if (typeof Firebase == "undefined") {
    setTimeout(runServer, 100);
    return;
  }
  new ApeServer(function(id) {
    if (id) {
      prompt(
        "Your session ID is " + id + ", share the URL:",
        APE_PATH + "/view.html?id=" + id
      );
    } else {
      alert("Sorry, the share failed!");
    }
  });
}

if (window.runMarklet) {
  // Signal to start in master mode.
  runServer(); 
}
