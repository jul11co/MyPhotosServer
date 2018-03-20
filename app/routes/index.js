// routes/index.js

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

var Photos = require('./photos');
var Collections = require('./collections');
var Folders = require('./folders');
var Favorites = require('./favorites');

var Settings = require('./settings');
var Stats = require('./stats');
var Cache = require('./cache');

var FileBrowser = require('./filebrowser');

module.exports = function(app) {

  // GET /
  app.get('/', function(req, res){
    res.render('index', {query: req.query});
  });

  // GET /
  app.get('/settings', Settings.getSettings);
  app.put('/settings', Settings.saveSettings);

  // GET /file?path=...
  app.get('/file', function(req, res) {
    // console.log('Open file:', req.query.path);
    if (req.query.path) {
        res.sendFile(req.query.path, {
      });
    }
  });

  // photos

  app.get('/photos', Photos.getPhotos);
  app.post('/photos', multipartMiddleware, Photos.addPhoto);
  app.get('/photos/search', Photos.searchPhotos);
  app.get('/photos/count', Photos.getPhotosCount);

  app.get('/photos/:photo_id', Photos.getPhoto);
  app.delete('/photos/:photo_id', Photos.deletePhoto);

  // collections

  app.get('/collections', Collections.getCollections);
  app.post('/collections', Collections.addCollection);
  app.get('/collections/search', Collections.searchCollections);
  app.get('/collections/count', Collections.getCollectionsCount);

  app.get('/collections/:collection_id', Collections.getCollection);
  app.delete('/collections/:collection_id', Collections.deleteCollection);

  // folders

  app.get('/folders', Folders.getFolders);
  app.post('/folders', Folders.addFolder);
  app.get('/folders/search', Folders.searchFolders);
  app.get('/folders/count', Folders.getFoldersCount);

  app.get('/folders/:folder_id', Folders.getFolder);
  app.put('/folders/:folder_id', Folders.updateFolder);
  app.delete('/folders/:folder_id', Folders.deleteFolder);

  // favorites

  app.get('/favorites', Favorites.getFavorites);
  app.post('/favorites', Favorites.addToFavorites);
  app.get('/favorites/count', Favorites.getFavoritesCount);

  app.get('/favorites/:entry_id', Favorites.getFavorite);
  app.delete('/favorites/:entry_id', Favorites.removeFavorite);

  // stats

  app.get('/stats', Stats.getStats);

  // cache

  // GET /cache/image?src=... 
  app.get('/cache/image', Cache.cacheImage);

  // GET /filebrowser?path=...
  // GET /filebrowser?path=...&type=files
  // GET /filebrowser?path=...&type=folders
  app.get('/filebrowser', FileBrowser.browsePath);

};