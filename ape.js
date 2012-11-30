
var APE_PATH = "http://localhost/ape";
var FIREBASE_URL = "https://ape.firebaseIO.com";

function Ape(doc) {
  this._doc = doc;
  this._counter = 1000;
  this._current = null;
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

    var attrs = this._serializeAttributes(el);
    var children = this._serializeChildren(el);
    for (var i = 0; i < children.length; i++) {
      if (typeof children[i] != "string") {
        children[i] = this._serializeElement(children[i]);
      }
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
          ret.push(value);
        }
      } else if (child.nodeType == this._doc.ELEMENT_NODE) {
        ret.push(child);
      }
    }

    return ret;
  },

  _serializeDocument: function() {
    this._current = {
      href: location.href,
      html: this._serializeAttributes(this._doc.childNodes[0]), // <html>
      head: this._serializeElement(this._doc.head), // <head>
      body: this._serializeElement(this._doc.body), // <body>
    };
    return this._current;
  },

  _diffElement: function(previous, current, base) {
    // Diff the attributes first.
    if (previous.self.id != current.self.id ||
        previous.self.name != current.self.name) {
      // Whoah, just reset the whole thing.
      base.set(current);
      return;
    }

    var attrs = current.self.attributes;
    if (JSON.stringify(previous.self.attributes) != JSON.stringify(attrs)) {
      var attrsRef = base.child("self").child("attributes");
      attrsRef.set(attrs);
    }

    // Now, diff the children in turn.
    var matchedSet = [];
    if (current.children && current.children.length) {
      for (var i = 0; i < current.children.length; i++) {
        var node = current.children[i];

        // Search for this node in the previous child set.
        var found = false;
        for (var j = 0; i < previous.children.length; j++) {
          var compare = previous.children[i];
          if (compare.self.id == node.self.id) {
            found = compare;
            matchedSet.push(compare.self.id);
            break;
          }
        }

        if (found) {
          // Diff the two children.
          this._diffElement(found, node, base.child("children").child(j));
        } else {
          // New element. XXX
        }
      }
    }
  },

  _setWithChildren: function(base, node) {
    base.child("self").set(node.self);

    if (!node.children || !node.children.length) {
      return;
    }

    var children = base.child("children");
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      var childRef = children.child(i + "p");

      // Remove the children's children before setting, will be added back.
      var childrensChildren = child.children;
      delete child.children;
      childRef.setWithPriority(child, i);

      if (typeof child != "string") {
        // Recurse, this time with children.
        child.children = childrensChildren;
        this._setWithChildren(childRef, child);
      }
    }
  },

  sendFullDocument: function(base, cb) {
    base.set({});
    var current = this._serializeDocument();

    // Convert all the children from an array to dictionary with priorities.
    base.child("href").set(current.href);
    base.child("html").set(current.html);
    this._setWithChildren(base.child("head"), current.head);
    this._setWithChildren(base.child("body"), current.body);

    if (cb) {
      // TODO. Actually call when succeeded.
      cb(true);
    }
  },

  sendDiffDocument: function(base) {
    this.sendFullDocument(base);
    /*
    var previous = this._current;
    var current = this._serializeDocument();

    // For <html> and <head> just refresh the whole thing since they are small.
    if (JSON.stringify(previous.html) != JSON.stringify(current.html)) {
      var html = base.child("html");
      html.set(current.html);
    }

    if (JSON.stringify(previous.head) != JSON.stringify(current.head)) {
      var head = base.child("head");
      head.set(current.head);
    }

    // No changes to <body>, just return.
    if (JSON.stringify(previous.body) == JSON.stringify(current.body)) {
      return;
    }

    this._diffElement(previous.body, current.body, base.child("body"));
    */
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
    this._ape.sendFullDocument(this._base, function(success) {
      if (success) {
        // Setup timer to watch for subsequent changes.
        self._cb(self._id);
        setInterval(self._ape.sendDiffDocument.bind(self._ape), 500, self._base);
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

    // First time set, then setup listeners for updates.
    this._base.once("value", function(snapshot) {
      var doc = snapshot.val();
      var baseRef = snapshot.ref();

      // For <html> and <head> we do full resets always.
      var html = baseRef.child("html");
      html.on("value", function(htmlSnap) {
        self._setAttributes(document.childNodes[0], htmlSnap.val());
      });

      var head = baseRef.child("head");
      head.on("value", function(headSnap) {
        self._setElement(document.head, headSnap);
      });

      // For the body, we setup listeners for every node and their children.
      document.body.removeChild(document.getElementById("loading"));
      document.body.jsmirrorId = doc.body.self.id;
      self._setupListeners(baseRef.child("body"), doc.body.self.id);
    });

    // Refresh the whole page once in every 10 seconds.
    setInterval(this._resetDoc.bind(this), 10000);
  },

  _getElementByMirrorId: function(id) {
    var all = document.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      if (all[i].jsmirrorId && all[i].jsmirrorId == id) {
        return all[i];
      }
    }
  },

  _setupListeners: function(node, nodeId) {
    var self = this;

    // First listen for self changes.
    var selfNode = node.child("self");
    selfNode.on("child_changed", function(selfSnap) {
      var newBody = selfSnap.val();
      var existing = self._getElementByMirrorId(newBody.id);
      if (!existing) {
        // Reset.
        self._resetDoc();
      } else if (existing.tagName != newBody.name) {
        // Element changed quite a bit.
        node.once("value", function(nodeSnap) {
          self._setElement(existing, nodeSnap);
        });
      } else {
        // Only attributes changed.
        self._setAttributes(existing, newBody.attributes);
      }
    });

    // Setup listeners for children.
    var childNodes = node.child("children");
    childNodes.on("child_added", function(newChildSnap) {
      self._addElement(newChildSnap, nodeId);
    });

    childNodes.on("child_removed", function(oldChildSnap) {
      self._removeElement(oldChildSnap, nodeId);
    });
  },

  _addElement: function(elSnapshot, parentId) {
    // Add the element and setup listeners for itself (and its children).
    var parentNode = this._getElementByMirrorId(parentId);
    if (!parentNode) {
      console.log("Child added to non existent parent! " + parentId);
      return;
    }

    // Arrays in Firebase are just objects with indexes as keys.
    var newElIndex = elSnapshot.name();

    // Find the element right after this so we can insertBefore it.
    var newElRef = elSnapshot.ref();
    var parentRef = newElRef.parent();

    // We have to get the next two, in case the immediate next is a text node.
    var elIndex = parseInt(newElIndex, 10);
    var nextElRef = parentRef.child((elIndex + 1) + "");
    var next2ElRef = parentRef.child((elIndex + 2) + "");

    var self = this;
    nextElRef.once("value", function(nextElSnap) {
      next2ElRef.once("value", function(next2ElSnap) {
        var newEl = elSnapshot.val();

        var toAdd = null;
        if (typeof newEl == "string") {
          toAdd = document.createTextNode(newEl);
        } else {
          toAdd = self._deserializeElement(elSnapshot, true);
        }

        if (!nextElSnap || !nextElSnap.val()) {
          parentNode.appendChild(toAdd);
        } else {
          var nextElSnapVal = nextElSnap.val();
          if (!nextElSnapVal.self) {
            // 2nd node is guaranteed to be non-text (unless it's the last).
            nextElSnapVal = next2ElSnap.val();
            if (!nextElSnapVal) {
              insertBefore = parentNode.lastChild;
            } else {
              insertBefore = self._getElementByMirrorId(nextElSnapVal.self.id);
            }
          } else {
            insertBefore = self._getElementByMirrorId(nextElSnapVal.self.id)
          }

          try {
            parentNode.insertBefore(toAdd, insertBefore);
          } catch(e) {
            console.log("Could not remove" + e);
          }
        }

        if (typeof newEl != "string") {
          self._setupListeners(newElRef, newEl.self.id);
        }
      });
    });
  },

  _removeElement: function(elSnapshot, parentId) {
    var elSnapVal = elSnapshot.val();
    
    if (typeof elSnapVal == "string") {
      // A text node needs to be removed.
      var parentNode = this._getElementByMirrorId(parentId);
      if (!parentNode) {
        console.log("Parent does not exist ! " + parentId);
        return;
      }

      // Go through each text node until we find the one we want and remove it.
      for (var i = 0; i < parentNode.childNodes.length; i++) {
        var node = parentNode.childNodes[i];
        if (node.nodeType == document.TEXT_NODE && node.nodeValue == elSnapVal) {
          node.parentNode.removeChild(node);
          return;
        }
      }

      console.log("Could not find text node " + elSnapVal + " in parent " + parentId);
      return;
    }

    var el = this._getElementByMirrorId(elSnapVal.self.id);
    if (!el) {
      console.log("Element to be removed does not exist! " + elSnapVal.self.id);
      return;
    }
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }

    // Remove listeners that may have been setup.
    var elRef = elSnapshot.ref();
    var elRefSelf = elRef.child("self");
    var elRefChildren = elRef.child("children");

    elRefSelf.off("child_changed");
    elRefChildren.off("child_added");
    elRefChildren.off("child_removed");
  },

  _resetDoc: function() {
    var self = this;
    this._base.once("value", function(snapshot) {
      self._renderDoc(snapshot);
    });
  },

  _renderDoc: function(snapshot) {
    if (!snapshot) {
      throw new Error("Empty document provided!");
    }

    var doc = snapshot.val();
    this._setAttributes(document.childNodes[0], doc.html);
    this._setElement(document.head, snapshot.child("head"));
    this._setBase(doc.href);
    this._setElement(document.body, snapshot.child("body"));
  },

  _setElement: function(el, snapshot) {
    var data = snapshot.val();
    if (el.tagName != data.self.name) {
      el.parentNode.replaceChild(this._deserializeElement(snapshot), el);
      return;
    }

    if (data.self.attributes) {
      this._setAttributes(el, data.self.attributes);
    }
    el.jsmirrorId = data.self.id;

    var children = snapshot.child("children");
    if (!children) {
      return;
    }

    var i = 0;
    var offset = 0;
    var self = this;
    children.forEach(function(child) {
      var childIndex = i + offset;
      var existing = el.childNodes[childIndex];
      if (!existing) {
        el.appendChild(self._deserializeElement(child));
      } else if (existing.jsmirrorHide) {
        offset++;
        i--;
      } else if (typeof child.val() == "string") {
        if (existing.nodeType != document.TEXT_NODE) {
          existing.parentNode.replaceChild(
            document.createTextNode(child.val()), existing
          );
        } else {
          existing.nodeValue = child.val();
        }
      } else {
        self._setElement(existing, child);
      }
      i++;
    });

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

  _deserializeElement: function(snapshot, ignoreChildren) {
    var data = snapshot.val();
    if (typeof data == "string") {
      return document.createTextNode(data);
    }

    var el;
    var attrs = data.self.attributes;

    el = document.createElement(data.self.name);
    for (var i in attrs) {
      if (attrs.hasOwnProperty(i) && el.setAttribute) {
        el.setAttribute(i, attrs[i]);
      }
    }

    var children = snapshot.child("children");
    if (!ignoreChildren && children) {
      var self = this;
      children.forEach(function(child) {
        if (typeof child.val() == "string") {
          el.appendChild(document.createTextNode(child.val()));
        } else {
          el.appendChild(self._deserializeElement(child));
        }
      });
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
