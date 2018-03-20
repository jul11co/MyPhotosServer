// databases/stats.js

var async = require('async');
var moment = require('moment');

var Datastore = require('nedb');

var config = require('../config');

var photodatedb = null;
var phototagdb = null;

/* Statistics */

exports.load = function() {
  photodatedb = new Datastore({
    filename: config.getDatabasePath('photodates.db'),
    autoload: true
  });
  phototagdb = new Datastore({
    filename: config.getDatabasePath('phototags.db'),
    autoload: true
  });
  photodatedb.ensureIndex({ fieldName: 'date' }, function (err) {
    if (err) console.log(err);
  });
}

exports.close = function() {
  photodatedb = null;
  phototagdb = null;
}

var updatePhotoTagStats = function(photo, removed, callback) {
  if (typeof removed == 'function') {
    callback = removed;
    removed = false;
  }
  callback = callback || function(err) {};

  if (photo && photo.tags && photo.tags.length) {

    // console.log('DB:', 'Update photo tag stats for:', photo.name);

    async.each(photo.tags, function(tag, cb) {
      phototagdb.findOne({tag: tag}, function(err, entry) {
        if (err) return cb(err);
        if (!entry && !removed) {
          phototagdb.insert({tag: tag, count: 1}, function(err) {
            cb(err);
          });
        } else if (entry) {
          phototagdb.update({_id: entry._id}, {$inc: {count: removed ? -1 : 1}}, function(err) {
            cb(err);
          });
        } else {
          cb();
        }
      });
    }, function(err){
      if (err) console.log(err);
      callback(err);
    });
  } else {
    callback();
  }
}

exports.updatePhotoTagStats = updatePhotoTagStats;

var updatePhotoDateStats = function(photo, removed, callback) {
  if (typeof removed == 'function') {
    callback = removed;
    removed = false;
  }
  callback = callback || function(err) {};

  if (photo && photo.created) {

    // console.log('DB:', 'Update photo date stats for:', photo.name);

    var created_moment = moment(photo.created);
    var created_day = created_moment.startOf('day').toDate();
    var created_month = created_moment.startOf('month').toDate();
    var created_year = created_moment.startOf('year').toDate();

    var updateYear = function(cb) {
      photodatedb.findOne({date: created_year, scope: 'year'}, function(err, entry) {
        if (err) return cb(err);
        if (!entry && !removed) {
          // console.log('DB:', 'New year:', created_year.getFullYear());
          photodatedb.insert({date: created_year, scope: 'year', count: 1}, function(err) {
            cb(err);
          });
        } else if (entry) {
          var update = {};
          if (removed) update = {$inc: {count: -1}};
          else update = {$inc: {count: 1}};
          photodatedb.update({_id: entry._id}, update, function(err) {
            cb(err);
          });
        } else {
          cb();
        }
      });
    }

    var updateMonth = function(cb) {
      photodatedb.findOne({date: created_month, scope: 'month'}, function(err, entry) {
        if (err) return cb(err);
        if (!entry && !removed) {
          // console.log('DB:', 'New month:', created_month.getFullYear() + '-' + (created_month.getMonth() + 1));
          photodatedb.insert({date: created_month, scope: 'month', count: 1}, function(err) {
            cb(err);
          });
        } else if (entry) {
          var update = {};
          if (removed) update = {$inc: {count: -1}};
          else update = {$inc: {count: 1}};
          photodatedb.update({_id: entry._id}, update, function(err) {
            cb(err);
          });
        } else {
          cb();
        }
      });
    }

    var updateDay = function(cb) {
      photodatedb.findOne({date: created_day, scope: 'day'}, function(err, entry) {
        if (err) return cb(err);
        if (!entry && !removed) {
          // console.log('DB:', 'New day:', created_day.getFullYear() + '-' 
          //    + (created_day.getMonth() + 1) + '-' + created_day.getDate());
          photodatedb.insert({date: created_day, scope: 'day', count: 1}, function(err) {
            cb(err);
          });
        } else if (entry) {
          var update = {};
          if (removed) update = {$inc: {count: -1}};
          else update = {$inc: {count: 1}};
          photodatedb.update({_id: entry._id}, update, function(err) {
            cb(err);
          });
        } else {
          cb();
        }
      });
    }

    async.series([
      updateYear,
      updateMonth,
      updateDay,
    ], function(err) {
      if (err) return callback(err);
      callback(err);
    });
  } else {
    callback();
  }
}

exports.updatePhotoDateStats = updatePhotoDateStats;

exports.getPhotoTagStats = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  phototagdb.count(condition, function(err, count) {
    if (err) return callback(err);

    var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
    var result_limit = (typeof options.limit != 'undefined') ? options.limit : 50;
    var result_sort = (typeof options.sort != 'undefined') ? options.sort : {count: -1};
    phototagdb.find(condition).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, tags) {
      if (err) return callback(err);

      var result = {
        count: count || 0,
        limit: result_limit,
        tags: tags
      };
      callback(null, result);
    });
  });
}

exports.getPhotoDateStats = function(condition, options, callback) {
  if (typeof options == 'function') {
    callback = options;
    options = {};
  }
  photodatedb.count(condition, function(err, count) {
    if (err) return callback(err);

    var result_skip = (typeof options.skip != 'undefined') ? options.skip : 0;
    var result_limit = (typeof options.limit != 'undefined') ? options.limit : 50;
    var result_sort = (typeof options.sort != 'undefined') ? options.sort : {count: -1};
    photodatedb.find(condition).sort(result_sort).skip(result_skip).limit(result_limit).exec(function(err, dates) {
      if (err) return callback(err);

      var result = {
        count: count || 0,
        limit: result_limit,
        dates: dates
      };
      callback(null, result);
    });
  });
}
