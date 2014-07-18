var request = require('request');

exports.initialize = function initializeSchema(schema, callback) {
  schema.adapter = new WebService();
  process.nextTick(callback);
};

function WebService() {
  this._models = {};
  this.cache = {};
  this.ids = {};
}

WebService.prototype.installPostProcessor = function installPostProcessor(descr) {
  var dates = [];
  Object.keys(descr.properties).forEach(function(column) {
    if (descr.properties[column].type.name === 'Date') {
      dates.push(column);
    }
  });

  var postProcessor = function(model) {
    var max = dates.length;
    for (var i = 0; i < max; i++) {
      var column = dates[i];
      if (model[column]) {
        model[column] = new Date(model[column]);
      }
    };
  };

  descr.postProcessor = postProcessor;
};

WebService.prototype.preProcess = function preProcess(data) {
  var result = {};
  Object.keys(data).forEach(function(key) {
    if (data[key] != null) {
      result[key] = data[key];
    }
  })
  return result;
};

WebService.prototype.postProcess = function postProcess(model, data) {
  var postProcessor = this._models[model].postProcessor;
  if (postProcessor && data) {
    postProcessor(data);
  }
};

WebService.prototype.postProcessMultiple = function postProcessMultiple(model, data) {
  var postProcessor = this._models[model].postProcessor;
  if (postProcessor) {
    var max = data.length;
    for (var i = 0; i < max; i++) {
      if (data[i]) {
        postProcessor(data[i]);
      }
    };
  }
};

WebService.prototype.define = function defineModel(descr) {
  var m = descr.model.modelName;
  this.installPostProcessor(descr);
  this._models[m] = descr;
};

WebService.prototype.getResourceUrl = function getResourceUrl(model) {
  var url = this._models[model].settings.restPath;
  if (!url) throw new Error('Resource url (restPath) for ' + model + ' is not defined');
  return url;
};

WebService.prototype.getResourceExtension = function getResourceExtension(model) {
  var re = this._models[model].settings.restExtension;
  if (re == null) {
    return '.json';
  } else {
    return re;
  }
};

WebService.prototype.getBlankReq = function () {
  // TODO: fix this jquery stuff
  //if (!this.csrfToken) {
  //  this.csrfToken = $('meta[name=csrf-token]').attr('content');
  //  this.csrfParam = $('meta[name=csrf-param]').attr('content');
  //}
  var req = {};
  req[this.csrfParam] = this.csrfToken;
  req.headers = {};
  req.headers['Content-Type'] = 'application/json';
  return req;
}

WebService.prototype.create = function create(model, data, callback) {
  var req = this.getBlankReq();
  req[model] = this.preProcess(data);
  req.json = JSON.stringify(req[model]);
  req.url = this.getResourceUrl(model) + this.getResourceExtension(model);
  request.post(req, function (e, r, body) {
    if (r.statusCode === 200) {
      callback(null, body.id);
    } else {
      callback(res.error);
    }
  }, 'json');
  // this.cache[model][id] = data;
};

WebService.prototype.updateOrCreate = function (model, data, callback) {
  var mem = this;
  this.exists(model, data.id, function (err, exists) {
    if (exists) {
      mem.save(model, data, callback);
    } else {
      mem.create(model, data, function (err, id) {
        data.id = id;
        callback(err, data);
      });
    }
  });
};

WebService.prototype.save = function save(model, data, callback) {
  var _this = this;
  var req = this.getBlankReq();
  req.method = 'PUT';
  req[model] = this.preProcess(data);
  req.json = JSON.stringify(req[model]);
  req.url = this.getResourceUrl(model) + this.getResourceExtension(model);
  request.post(req, function (e, r, body) {
    if (r.statusCode === 200) {
      _this.postProcess(model, body);
      callback(null, body);
    } else {
      callback(res.error);
    }
  }, 'json');
};

WebService.prototype.exists = function exists(model, id, callback) {
  var req = this.getBlankReq();
  req.url = this.getResourceUrl(model) + '/' + id + this.getResourceExtension(model);
  req.json = true;
  request.get(req, function (e, r, body) {
    if (r.statusCode === 200) {
      callback(null, true);
    } else if (r.statusCode === 404) {
      callback(null, false);
    } else {
      callback(e);
    }
  });
};

WebService.prototype.find = function find(model, id, callback) {
  var _this = this;
  var req = this.getBlankReq();
  req.url = this.getResourceUrl(model) + '/' + id + this.getResourceExtension(model);
  req.json = true;
  request.get(req, function(e, r, body) {
    if (r.statusCode === 200) {
      _this.postProcess(model, body);
      callback(null, body);
    } else {
      callback(e);
    }
  });
};

WebService.prototype.destroy = function destroy(model, id, callback) {
  var _this = this;
  var req = this.getBlankReq();
  req.method = 'DELETE';
  req.url = this.getResourceUrl(model) + '/' + id + this.getResourceExtension(model);
  request.post(req, function (e, r, body) {
    if (r.statusCode === 200) {
      //delete _this.cache[model][id];
      callback(null, body);
    } else {
      callback(e);
    }
  }, 'json');
};

WebService.prototype.all = function all(model, filter, callback) {
  var _this = this;
  var req = this.getBlankReq();
  req.url = this.getResourceUrl(model) + this.getResourceExtension(model);
  if (filter !== null && typeof filter !== "undefined") {
    // Simple filter support
    var params = [];
    for (w in filter.where) {
      params.push(encodeURIComponent(w) + "=" + encodeURIComponent(filter.where[w]));
    }
    req.url += '?' + params.join('&');
  }
  req.json = true;
  request.get(req, function (e, r, body) {
    if (body.resources && body.resources.length > 0) {
      body = body.resources;
    } else {
      body = [];
    }

    if (r.statusCode === 200) {
      _this.postProcessMultiple(model, body);
      callback(null, body);
    } else {
      callback(e);
    }
  });
};

WebService.prototype.destroyAll = function destroyAll(model, callback) {
  throw new Error('Not supported');
};

WebService.prototype.count = function count(model, callback, where) {
  throw new Error('Not supported');
};

WebService.prototype.updateAttributes = function (model, id, data, callback) {
  data.id = id;
  this.save(model, data, callback);
};