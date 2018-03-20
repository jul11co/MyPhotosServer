// app/importer.js

var request = require('request');
var fs = require('fs');

var TOKEN = 'InsertTokenHere';

var defaultHost = 'http://127.0.0.1:31114';
var addPhotoURL = '/photos';

exports.setDefaultHost = function(host) {
  defaultHost = host;
}

exports.setToken = function(token) {
  TOKEN = token;
}

exports.importPhoto = function(data, options, callback) {
  // console.log('importPhoto: ' + data.photo.name);
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  var import_url = defaultHost + addPhotoURL;
  if (typeof options.import_url !== 'undefined') {
    import_url = options.import_url;
  }
  if (!import_url || import_url == '') {
    return callback(new Error('Empty import URL'));
  }

  var post_options = {
    url: import_url,
    // json: data,
    formData: {
      photo: JSON.stringify(data.photo)
    },
    json: true,
    headers: {
      "Authorization": "Bearer " + TOKEN,
      "Connection": "keep-alive"
    }
  };

  if (data.photo.thumb_file) {
    post_options.formData.thumb_file = fs.createReadStream(data.photo.thumb_file)
  }

  request.post(post_options, function(err, httpResponse, body) {
    if (err) {
      var retry_count = options.retry_count || 0;
      var max_retry_count = options.max_retry_count || 3;
      if (err.code == 'ECONNRESET' && retry_count <= max_retry_count && !options.no_import_retry) {
        retry_count++;
        options.retry_count = retry_count;
        console.log('Connection reset. Retrying...', retry_count);
        setTimeout(function() {
          exports.importPhoto(data, options, callback)
        }, 2000);
        return;
      }
      console.log('Import photo failed:', err.code, err.message);
      return callback(err);
    }
    if (options.retry_count) options.retry_count = 0;
    if (options.verbose) {
      console.log('Import result:', body);
      console.log('');
    }
    callback(null, body);
  });
}
