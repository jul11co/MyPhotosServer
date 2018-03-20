angular.module('MyPhotos.services.db', [])
  .factory('dbService', ['$rootScope', '$http', '$httpParamSerializer', 
    function($rootScope, $http, $httpParamSerializer) {

    var httpGet = function(base_url, options, callback) {
      var query_url = base_url;
      var querystring = $httpParamSerializer(options);
      if (querystring) {
        query_url += '?' + querystring;
      }

      $http.get(query_url).then(function(response) {
        // this callback will be called asynchronously
        // when the response is available
        callback(null, response.data);
      }, function(response) {
        console.log(response);
        callback(response);
      });
    };

    var httpPost = function(base_url, data, options, callback) {
      var query_url = base_url;
      var querystring = $httpParamSerializer(options);
      if (querystring) {
        query_url += '?' + querystring;
      }

      $http.post(query_url, data).then(function(response) {
        // this callback will be called asynchronously
        // when the response is available
        callback(null, response.data);
      }, function(response) {
        console.log(response);
        callback(response);
      });
    }

    var httpPut = function(base_url, data, options, callback) {
      var query_url = base_url;
      var querystring = $httpParamSerializer(options);
      if (querystring) {
        query_url += '?' + querystring;
      }

      $http.put(query_url, data).then(function(response) {
        // this callback will be called asynchronously
        // when the response is available
        callback(null, response.data);
      }, function(response) {
        console.log(response);
        callback(response);
      });
    }

    var httpDelete = function(base_url, options, callback) {
      var query_url = base_url;
      var querystring = $httpParamSerializer(options);
      if (querystring) {
        query_url += '?' + querystring;
      }

      $http.delete(query_url).then(function(response) {
        // this callback will be called asynchronously
        // when the response is available
        callback(null, response.data);
      }, function(response) {
        console.log(response);
        callback(response);
      });
    };

    var service = {
      
      /*
      * SETTINGS
      */

      getSettings: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        httpGet('/settings', options, callback);
      },

      saveSettings: function(settings, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        httpPut('/settings', settings, options, callback);
      },

      /*
      * COLLECTIONS
      */

      getCollections: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        httpGet('/collections', options, callback);
      },

      getCollectionsCount: function(callback) {
        httpGet('/collections/count', {}, callback);
      },

      searchCollections: function(query, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        if (typeof query == 'string') {
          options.q = query
        } else {
          options.q = query.q;
        }

        httpGet('/collections/search', options, callback);
      },

      getCollection: function(collection_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        options.with_photos = 1;
        httpGet('/collections/' + collection_id, options, callback);
      },

      removeCollection: function(collection_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpDelete('/collections/' + collection_id, options, callback);
      },

      /*
      * FOLDERS
      */

      getFolders: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        httpGet('/folders', options, callback);
      },

      getFoldersCount: function(callback) {
        httpGet('/folders/count', options, callback);
      },

      searchFolders: function(query, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        if (typeof query == 'string') {
          options.q = query;
        } else {
          options.q = query.q;
        }

        httpGet('/folders/search', options, callback);
      },

      getFolder: function(folder_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpGet('/folders/' + folder_id, options, callback);
      },

      updateFolder: function(folder_id, update, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpPut('/folders/' + folder_id, update, options, callback);
      },

      removeFolder: function(folder_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpDelete('/folders/' + folder_id, options, callback);
      },

      /*
      * PHOTOS
      */

      getPhotos: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpGet('/photos', options, callback);
      },

      getPhotosCount: function(callback) {
        httpGet('/photos/count', {}, callback);
      },

      searchPhotos: function(query, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        if (typeof query == 'string') {
          options.q = query;
        } else {
          options.q = query.q;
        }

        httpGet('/photos/search', options, callback);
      },

      removePhoto: function(photo_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpDelete('/photos/' + photo_id, options, callback);
      },

      /*
      * STATS
      */

      getStats: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpGet('/stats', options, callback);
      },

      /*
      * FAVORITES
      */

      addToFavorites: function(item, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpPost('/favorites', item, options, callback);
      },

      removeFromFavorites: function(item_id, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpDelete('/favorites/' + item_id, options, callback);
      },

      getFavorites: function(options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }

        httpGet('/favorites', options, callback);
      },

      getFavoritesCount: function(callback) {
        httpGet('/favorites/count', {}, callback);
      },

      searchFavorites: function(query, options, callback) {
        if (typeof options == 'function') {
          callback = options;
          options = {};
        }
        options = options || {};

        if (typeof query == 'string') {
          options.q = query;
        }

        httpGet('/favorites/search', options, callback);
      },

    };
    return service;
  }]);