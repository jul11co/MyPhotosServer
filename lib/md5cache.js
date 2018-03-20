var path = require('path');
var md5file = require('md5-file');

var md5cache = undefined;
var root_dir = undefined;

exports.setRootDirectory = function(root_path) {
  root_dir = root_path;
}

exports.setDataStore = function(datastore) {
  md5cache = datastore;
}

exports.getMD5 = function(file_path, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  if (!md5cache) {
    var md5sum = md5file.sync(file_path);
    return callback(null, md5sum);
  }

  // console.log('getMD5: ' + file_path);

  var file_key = root_dir ? path.relative(root_dir, file_path) : file_path;

  md5cache.get(file_key, function(err, md5sum) {
    if (err) {
      if (!err.notFound) { // io error
        return callback(err);
      }
    }
    if (!md5sum) {
      try {
        md5sum = md5file.sync(file_path);
      } catch(e) {
        console.log(e);
        return callback(e);
      }
      md5cache.set(file_key, md5sum, function(err) {
        if (err) {
          console.log(err);
          return callback(err);
        }
        callback(null, md5sum);
      });
    } else {
      callback(null, md5sum);
    }
  });
}