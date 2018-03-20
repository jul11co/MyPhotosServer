var dirty = require('dirty');

var DirtyStore = function(db) {
  this.dbLoaded = false;
  this.db = dirty(db);

  var self = this;
  self.db.on('load', function() {
    // console.log('DirtyStore loaded.');
    self.dbLoaded = true;
  });
  self.db.on('drain', function() {
    // console.log('DirtyStore: All records are saved on disk now.');
  });
};

DirtyStore.prototype.set = function(key, value, callback) {
  this.db.set(key, value, function(err) {
    if (err) return callback(err);
    callback();
  });
}

DirtyStore.prototype.get = function(key, callback) {
  var value = this.db.get(key);
  callback(null, value);
}

DirtyStore.prototype.delete = function(key, callback) {
  this.db.rm(key, function(err) {
    if (err) return callback(err);
    callback();
  });
}

function updateObject(original, update, verbose) {
  if (typeof original == 'object' && typeof update == 'object') {
    for (var prop in update) {
      if (verbose) {
        console.log('Update prop "' + prop + '":', 
          ' (' + typeof original[prop] + ' --> ' + typeof update[prop] + ')');
      }
      if (typeof original[prop] == 'object' && typeof update[prop] == 'object') {
        updateObject(original[prop], update[prop], verbose);
      } else {
        original[prop] = update[prop];
      }
    }
  } else {
    original = update;
  }
}

DirtyStore.prototype.update = function(key, update, callback) {
  var self = this;
  self.get(key, function(err, value) {
    if (err) return callback(err);
    if (!value) {
      self.set(key, update, function(err) {
        if (err) return callback(err);
        callback();
      });
    } else {
      if (typeof value == 'object' && typeof update == 'object') {
        updateObject(value, update);
      } else {
        value = update;
      }
      self.set(key, value, function(err) {
        if (err) return callback(err);
        callback();
      });
    }
  });
}

// for array value only
DirtyStore.prototype.push = function(key, value, callback) {
  var self = this;
  self.get(key, function(err, array) {
    if (err) return callback(err);
    if (!array) {
      array = [];
      array.push(value);
      self.set(key, array, function(err) {
        if (err) return callback(err);
        callback();
      });
    } else {
      if (Object.prototype.toString.call(array) === '[object Array]') {
        array.push(value);
        self.set(key, array, function(err) {
          if (err) return callback(err);
          callback();
        });
      } else {
        callback(new Error('Cannot push to this key (not an array)'));
      }
    }
  });
}

module.exports = DirtyStore;