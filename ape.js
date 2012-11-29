
var APE_PATH = "http://localhost/ape";
var FIREBASE_URL = "https://ape.firebaseIO.com";

function Ape(doc) {
  this._doc = doc;
  this._current = null;
  this._counter = 1000;
  this._elements = {};
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
        (!this._toSkipIfEmpty[el.name]) &&
        (!el.childNodes.length))) {
      return true;
    }

    return false;
  },

  _addElement: function(el, list) {
    list[el.id] = el;
    return el;
  },

  // Similar to BrowserMirror, each element is an object of the following form:
  // { name: tagName, id: jsmirrorId, attributes: {...}, children: [...] }
  _serializeElement: function(el, list) {
    if (!el.jsmirrorId) {
      el.jsmirrorId = this._makeId();
    }

    if (el.tagName == "RAWSTRING") {
      return this._addElement({
        name: "RAWSTRING",
        id: el.jsmirrorId,
        val: el.val,
        children: []
      }, list);
    }

    if (el.tagName == "CANVAS") {
      return this._addElement({
        name: "IMG",
        id: el.jsmirrorId,
        attributes: {src: el.toDataURL("image/png")},
        children: []
      }, list);
    }

    var attrs = this._serializeAttributes(el);
    var children = this._serializeChildren(el);
    for (var i = 0; i < children.length; i++) {
      children[i] = this._serializeElement(children[i], list);
    }

    return this._addElement({
      name: el.tagName,
      id: el.jsmirrorId,
      attributes: attrs,
      children: children.map(function(child) {
        return child.id;
      })
    }, list);
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

  // Returns an array of children, each item in the array is a node.
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
          ret[ret.length - 1] += value;
        } else {
          ret.push({tagName: "RAWSTRING", val: value});
        }
      } else if (child.nodeType == this._doc.ELEMENT_NODE) {
        ret.push(child);
      }
    }

    return ret;
  },

  pushChanges: function(base) {
    var newBody = this.serializeDocument();
  },

  serializeDocument: function() {
    var elements = {};
    var head = this._serializeElement(this._doc.head, elements);
    var body = this._serializeElement(this._doc.body, elements);

    elements.html = this._serializeAttributes(this._doc.childNodes[0]), // <html>
    elements.head = head; // <head>
    elements.body = body; // <body>

    return elements;
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
    var doc = this._ape.serializeDocument();
    console.log(doc);

    // First time upload of document.
    this._base.set(doc, function(success) {
      if (success) {
        // Setup timer to watch and update subsequent changes.
        self._cb(self._id);
        setInterval(function() {
          self._ape.pushChanges(self._base);
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

  _renderDoc: function(elements) {
    if (!elements) {
      throw new Error("Empty document provided!");
    }

    document.head.innerHTML = "";
    document.body.innerHTML = "";

    this._setAttributes(document.childNodes[0], elements.html);
    this._setElement(document.head, elements.head, elements);
    this._setBase(elements.href);
    this._setElement(document.body, elements.body, elements);
  },

  _setElement: function(el, data, list) {
    var children = data.children;

    if (el.name != data.name) {
      el.parentNode.replaceChild(this._deserializeElement(data, list), el);
      return;
    }

    this._setAttributes(el, data.attributes);
    el.jsmirrorId = data.id;

    if (!children) {
      return;
    }

    var offset = 0;
    for (var i = 0; i < children.length; i++) {
      var childIndex = i + offset;
      var existing = el.childNodes[childIndex];
      var newChild = list[children[i]];

      if (!existing) {
        el.appendChild(this._deserializeElement(newChild, list));
      } else if (existing.jsmirrorHide) {
        offset++;
        i--;
        continue;
      } else if (newChild.name == "RAWSTRING") {
        if (existing.nodeType != document.TEXT_NODE) {
          existing.parentNode.replaceChild(
            document.createTextNode(newChild.val), existing
          );
        } else {
          existing.nodeValue = newChild.val;
        }
      } else {
        this._setElement(existing, newChild, list);
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

  _deserializeElement: function(data, list) {
    if (data.name == "RAWSTRING") {
      return document.createTextNode(data.val);
    }

    var el;
    var attrs = data.attributes;
    var children = data.children;

    el = document.createElement(data.name);
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i) && el.setAttribute) {
        el.setAttribute(i, attrs[i]);
      }
    }

    if (children) {
      for (var i = 0; i < children.length; i++) {
        var o = list[children[i]];
        if (o.name == "RAWSTRING") {
          el.appendChild(document.createTextNode(o.val));
        } else {
          el.appendChild(this._deserializeElement(o, list));
        }
      }
    }

    el.jsmirrorId = data.id;
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
