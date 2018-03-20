var path = require('path');
var fs = require('fs');
var fse = require('fs-extra');
var crypto = require('crypto');
var md5file = require('md5-file');

// var easyimg = require('easyimage');

// npm install calipers calipers-png calipers-jpeg calipers-gif
var calipers = require('calipers')('png', 'jpeg', 'gif');

// npm install sharp
var sharp = require('sharp'); 

// npm install lwip
// var lwip = require('lwip'); 

var md5cache = require('./md5cache');

var use_sharp = true;
var use_calipers = true;
var use_lwip = false;

var fileExists = function(file_path) {
  try {
    var stats = fs.statSync(file_path);
    if (stats.isFile()) {
      return true;
    }
  } catch (e) {
  }
  return false;
}

exports.getPhotoInfo = function(photo_file, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  if (use_calipers || options.calipers) {
    calipers.measure(photo_file, function(err, info) {
      if (err) return callback(err);
      var result = {
        type: info.type
      };
      if (info.pages && info.pages.length) {
        result.width = info.pages[0].width;
        result.height = info.pages[0].height;
      }
      callback(null, result);
    });
  }
  else if (use_lwip || options.lwip) {
    lwip.open(photo_file, function(err, image){
      if (err) return callback(err);

      callback(null, {
        width: image.width(),
        height: image.height(),
        image: image
      });
    });
  } 
  else {
    // easyimg.info(photo_file).then(function(file_info) {
    //   // console.log(file_info);
    //   callback(null, file_info);
    // }, function (err) {
    //   return callback(err);
    // }); 
    return callback(new Error('Not implemented'));
  }
}

exports.generateThumbImage = function(photo_file, thumb_file, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }

  options = options || {};

  var thumb_width = options.thumb_width || 256;
  var thumb_height = options.thumb_height || 256;

  if (use_sharp || options.sharp) {
    fs.readFile(photo_file, function(err, photo_buff) {
      if (err) return callback(err);
      
      sharp(photo_buff)
        .resize(thumb_width, thumb_height)
        .toFile(thumb_file, function(err, info) {
          if (err) return callback(err);
          callback();
        });
    });
  }
  else if (use_lwip || options.lwip) {
    if (options.image) {
      options.image.cover(thumb_width, thumb_height, function(err, image) {
        if (err) return callback(err);

        image.writeFile(thumb_file, function(err) {
          if (err) return callback(err);

          callback();
        });
      });
    } else {
      lwip.open(photo_file, function(err, image){
        if (err) return callback(err);

        image.cover(thumb_width, thumb_height, function(err, image) {
          if (err) return callback(err);

          image.writeFile(thumb_file, function(err) {
            if (err) return callback(err);

            callback();
          });
        });
      });
    }
  } 
  else {
    // easyimg.thumbnail({
    //   src: photo_file, 
    //   dst: thumb_file,
    //   width: thumb_width, 
    //   height: thumb_height,
    //   x:0, y:0
    // }).then(function (file) {
    //   callback();
    // }, function (err) {
    //   return callback(err);
    // });
    return callback(new Error('Not implemented'));
  }
}

exports.getInfo = function(photo_file, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  
  var result = {};

  // var start = new Date();

  md5cache.getMD5(photo_file, function(err, md5sum) {
    if (err) return callback(err);

    // console.log('TIME: getMD5', new Date()-start);

    result.md5sum = md5sum;

    // start = new Date();

    exports.getPhotoInfo(photo_file, function(err, file_info) {
      if (err) return callback(err);

      // console.log('TIME: getPhotoInfo', new Date()-start);
      // console.log(file_info);

      result.name = file_info.name;

      result.type = file_info.type;
      result.size = file_info.size;
      result.width = file_info.width;
      result.height = file_info.height;
      result.depth = file_info.depth;
      result.density = file_info.density;

      callback(null, result);
    }); // getPhotoInfo
  }); // getMD5
}

exports.getInfoAndGenerateThumbImage = function(photo_file, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  
  var result = {};

  // var start = new Date();

  md5cache.getMD5(photo_file, function(err, md5sum) {
    if (err) return callback(err);

    // console.log('TIME: getMD5', new Date()-start);

    result.md5sum = md5sum;

    // start = new Date();

    exports.getPhotoInfo(photo_file, function(err, file_info) {
      if (err) return callback(err);

      // console.log('TIME: getPhotoInfo', new Date()-start);
      // console.log(file_info);

      result.name = file_info.name;

      result.type = file_info.type;
      result.size = file_info.size;
      result.width = file_info.width;
      result.height = file_info.height;
      
      if (file_info.depth) result.depth = file_info.depth;
      if (file_info.density) result.density = file_info.density;

      if (result.width < options.min_width || result.height < options.min_height) {
        // Do not generate thumbnail
        return callback(null, result);
      }

      // Generate thumbnail
      var outputdir = options.outputdir || path.join(__dirname, '..', '_tmp', 'thumbs');
      fse.ensureDirSync(outputdir);

      var thumb_file = result.md5sum + path.extname(photo_file);
      var thumb_image = path.join(outputdir, thumb_file[0], thumb_file[1], thumb_file[2], thumb_file);

      fse.ensureDirSync(path.dirname(thumb_image));

      if (fileExists(thumb_image)) {
        result.thumb_image = thumb_image;
        return callback(null, result);
      }

      // start = new Date();

      exports.generateThumbImage(photo_file, thumb_image, {
        thumb_width: options.thumb_width || 256, 
        thumb_height: options.thumb_height || 256,
        image: file_info.image
      }, function(err) {
        if (file_info.image) file_info.image = null;

        // console.log('TIME: generateThumbImage', new Date()-start);

        if (err) return callback(err);

        result.thumb_file = thumb_file;
        result.thumb_image = thumb_image;

        callback(null, result);
      });
    }); // getPhotoInfo
  }); // getMD5
}
