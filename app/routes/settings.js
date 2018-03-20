// routes/settings.js

var db = require('../db');

// GET /settings
exports.getSettings = function(req, res, next) {
  db.getSettings({}, function(err, settings) {
    if (err) return next(err);
    res.json(settings);
  });
}

// PUT /settings
exports.saveSettings = function(req, res, next) {
  db.saveSettings(req.body, {}, function(err, result) {
    if (err) return next(err);
    res.json(result);
  });
}