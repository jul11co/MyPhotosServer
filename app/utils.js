// app/utils.js

var fs = require('fs');
var path = require('path');
var fse = require('fs-extra');

var crypto = require('crypto');

var fileExistsSync = function(file_path, callback) {
  try {
    var stats = fs.statSync(file_path);
    if (stats.isFile()) {
      return true;
    }
  } catch (e) {
    // console.log(e);
    // return callback(e);
  }
  return false;
}

var fileExists = function(file_path, callback) {
  try {
    var stats = fs.statSync(file_path);
    if (stats.isFile()) {
      return callback(null, true);
    }
  } catch (e) {
    // console.log(e);
    // return callback(e);
  }
  return callback(null, false);
}

var folderExistsSync = function(folder_path) {
  try {
    var stats = fs.statSync(folder_path);
    if (stats.isDirectory()) {
      return true;
    }
  } catch (e) {
    // console.log(e);
    // return callback(e);
  }
  return false;
}

var folderExists = function(folder_path, callback) {
  try {
    var stats = fs.statSync(folder_path);
    if (stats.isDirectory()) {
      return callback(null, true);
    }
  } catch (e) {
    // console.log(e);
    // return callback(e);
  }
  return callback(null, false);
}

var escapeRegExp = function(string) {
  if (!string) return '';
  return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

var replaceAll = function(string, find, replace) {
  return string.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

var buildSearchCondition = function(query, search_field) {
  var condition = {};
  search_field = search_field || 'name';
  var queries = query.q.split(' ');
  if (['tags'].indexOf(search_field) != -1) {
    if (queries.length == 1) {
      condition[search_field] = {$elemMatch: new RegExp(escapeRegExp(query.q), 'i')};
    } else {
      condition.$and = [];
      queries.forEach(function(q) {
        var cond = {};
        cond[search_field] = {$elemMatch: new RegExp(escapeRegExp(q), 'i')};
        condition.$and.push(cond);
      });
    }
  } else {
    if (queries.length == 1) {
      condition[search_field] = new RegExp(escapeRegExp(query.q), 'i');
    } else {
      condition.$and = [];
      queries.forEach(function(q) {
        var cond = {};
        cond[search_field] = new RegExp(escapeRegExp(q), 'i');
        condition.$and.push(cond);
      });
    }
  }
  
  return condition;
}

function isUpperCase(c) {
    // return ((c >= 'A') && (c <= 'Z'));
    return c != '' && c == c.toUpperCase();
}

function isNumeric(string){
  return !isNaN(string)
}

var replaceAllChars = function(string, chars, replace) {
  for (var i = 0; i < chars.length; i++) {
    string = string.replace(new RegExp(escapeRegExp(chars[i]), 'g'), replace)
  }
  return string;
}

var extractCapitalizedWords = function(string) {

  var capitalized_words = [];

  string = replaceAllChars(string, '?\'‘’-:,.()[]—_“”&#;\"\/《》「」【】', "|");
  // console.log('String (partitioned):', string);

  var partitions = string.split('|');
  // console.log('Partitions:', partitions.length);
  // console.log(partitions);

  var words = [];
  var tmp_w = [];

  partitions.forEach(function(part) {
    if (part == '') return;

    words = part.split(' ');
    tmp_w = [];

    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var first_c = w.slice(0,1);
      if (/*!isNumeric(w) && */isUpperCase(first_c)) {
        tmp_w.push(w);
      } else if (tmp_w.length) {
        capitalized_words.push(tmp_w.join(' '));
        tmp_w = [];
      }
    }
    if (tmp_w.length) {
      capitalized_words.push(tmp_w.join(' '));
      tmp_w = [];
    }
  });

  // console.log('Capilized words:', capitalized_words.length);
  // console.log(capitalized_words);

  return capitalized_words;
}

var compareTwoArrayOfStrings = function(array1, array2) {
  if (!array1 && !array2) return true;
  if (!array1 || !array2) return false;
  if (array1.length != array2.length) return false;
  for (var i = 0; i < array1.length; i++) {
    if (array1[i] != array2[i]) return false;
  }
  return true;
}

var removeFile = function(file_path, callback) {
  fse.remove(file_path, function(err) {
    callback(err);
  });
}

var removeFolder = function(folder_path, callback) {
  fse.remove(folder_path, function(err) {
    callback(err);
  });
}

function md5Hash(string) {
  return crypto.createHash('md5').update(string).digest('hex');
}

function getStat(_path) {
  var stat = undefined;
  try {
    stat = fs.lstatSync(_path);
  } catch(e) {
    console.log(e);
  }
  return stat;
}

module.exports = {
  getStat: getStat,
  md5Hash: md5Hash,

  fileExistsSync: fileExistsSync,
  fileExists: fileExists,
  folderExistsSync: folderExistsSync,
  folderExists: folderExists,

  escapeRegExp: escapeRegExp,
  replaceAll: replaceAll,

  buildSearchCondition: buildSearchCondition,

  compareTwoArrayOfStrings: compareTwoArrayOfStrings,

  replaceAllChars: replaceAllChars,
  extractCapitalizedWords: extractCapitalizedWords,

  removeFile: removeFile,
  removeFolder: removeFolder
}
