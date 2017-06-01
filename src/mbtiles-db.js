const sqlite3 = require('sqlite3')
const _ = require('lodash')
const Promise = require('bluebird')

function init(dbFile) {

  const db = new sqlite3.Database(dbFile)

  function insertTiles(tiles) {
    return new Promise((resolve, reject) => {
      db.serialize(function() {
        const preparedStatement = db.prepare("INSERT INTO tiles VALUES (?,?,?,?)")
        _.each(tiles, t => {
          preparedStatement.run(t.z, t.x, t.y, t.data)
        })
        preparedStatement.finalize(resolve)
      })
    })
  }

  function createMetadata({layerId, bbox, zoom}) {
    console.log('Insert metadata ...')
    db.run('INSERT INTO metadata VALUES(?,?)', ['bounds', _.flatten(bbox).join(',')])
    db.run('INSERT INTO metadata VALUES(?,?)', ['maxzoom', zoom])
    db.run('INSERT INTO metadata VALUES(?,?)', ['minzoom', zoom])
    db.run('INSERT INTO metadata VALUES(?,?)', ['name', `wmts-to-mbtiles-${zoom}`])
    db.run('INSERT INTO metadata VALUES(?,?)', ['type', 'overlay'])
    db.run('INSERT INTO metadata VALUES(?,?)', ['version', '1'])
    db.run('INSERT INTO metadata VALUES(?,?)', ['description', `${layerId}`])
    db.run('INSERT INTO metadata VALUES(?,?)', ['format', 'png'])
  }

  function close() {
    db.close()
  }

  function initTables() {
    db.serialize(function() {
      db.run('CREATE TABLE metadata (name text, value text);')
      db.run('CREATE UNIQUE INDEX name ON metadata (name);')

      db.run('CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);')
      db.run('CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);')
      db.run('PRAGMA synchronous=OFF')
    })
  }

  return {
    initTables,
    insertTiles,
    createMetadata,
    close
  }
}

module.exports = init