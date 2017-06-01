const request = require('request')
const _ = require('lodash')
const url = require('url')
const Promise = require('bluebird')
const {getCapabilities} = require('./wmts-parser')
const {HttpsAgent} = require('agentkeepalive')
const {longitudeToTileColumn, latitudeToTileRow, tileColumnToLongitude, tileRowToLatitude} = require('./utils')
const mbtilesDb = require('./mbtiles-db')

const keepaliveAgent = new HttpsAgent({maxSockets: 50})

module.exports = function({mbtilesFile, wmtsUrl, layer, zoom, bbox}) {
  const db = mbtilesDb(mbtilesFile)
  db.initTables()
  getCapabilities(wmtsUrl)
    .then(capabilities => _.find(capabilities.layers, l => l.id === layer))
    .then(layer => getTiles({baseUrl: wmtsUrl, layer, zoom, bbox}))
    .then(() => {
      console.log(`All done for ${mbtilesFile}`)
      db.close()
    })

  function getTiles({baseUrl, layer, zoom, bbox}) {
    const correctTileSet = _.find(layer.wsg84.tileSets, set => set.zoom === zoom)
    const bboxUsed = bbox || correctTileSet.bounds
    const rows = determineRowsToFetch(correctTileSet, zoom, bboxUsed)
    const columns = determineColumnsToFetch(correctTileSet, zoom, bboxUsed)
    db.createMetadata({layerId: layer.id, bbox: bboxUsed, zoom})
    console.log(`Fetching tiles: ${_.first(columns)}-${_.last(columns)} x ${_.first(rows)}-${_.last(rows)}`)
    console.log(`Total size ${columns.length} x ${rows.length} = ${columns.length * rows.length} tiles`)
    const tilesDone = Promise.mapSeries(rows, (row, i) => {
      return fetchRow(row, columns)
        .then(columns => {
          console.log(`Row ${i+1}/${rows.length} done`)
          return columns
        })
        .then(db.insertTiles)
    })
    return tilesDone

    function fetchRow(row, columns) {
      return Promise.all(_.map(columns, col => fetchSingleTile(row, col)))
    }

    function fetchSingleTile(row, column) {
      const tileUrl = createTileUrl({
        baseUrl,
        layerId: layer.id,
        format: layer.format,
        matrixSetId: layer.wsg84.id,
        tileSetId: correctTileSet.id,
        row: row,
        column: column
      })

      const source = (i) => {
        return new Promise((resolve, reject) => {
          request({uri: tileUrl, agent: keepaliveAgent, encoding: null}, (error, response, body) => {
            if (error) {
              return reject(error)
            }
            if (!response) {
              return reject(`No response?`)
            }
            if (response.statusCode !== 200) {
              return reject(`Response ${response.statusCode}`)
            }
            const y = (1 << zoom) - 1 - row // mbtiles needs flipped y coordinate
            resolve({z: zoom, y, x: column, data: response.body})
          })
        })
      }

      return retry({source, retries: 3})
    }
  }
}

function determineRowsToFetch(tileSet, zoom, requestedBbox) {
  function getRow(lat) {
    const row = latitudeToTileRow(lat, zoom)
    if (row < tileSet.minTileRow || row > tileSet.maxTileRow + 1) {
      throw `Latitude ${lat} over chart limits. Given bbox: ${requestedBbox}, tileset bounds: ${tileSet.bounds}`
    }
    return row
  }
  const row0 = getRow(requestedBbox[3])
  const row1 = getRow(requestedBbox[1])
  return _.range(row0, row1)
}

function determineColumnsToFetch(tileSet, zoom, requestedBbox) {
  function getColumn(lon) {
    const col = longitudeToTileColumn(lon, zoom)
    if (col < tileSet.minTileColumn || col > tileSet.maxTileColumn + 1) {
      console.log('c', col, JSON.stringify(tileSet))
      throw `Longitude ${lon} over chart limits. Given bbox: ${requestedBbox}, tileset bounds: ${tileSet.bounds}`
    }
    return col
  }
  const col0 = getColumn(requestedBbox[0])
  const col1 = getColumn(requestedBbox[2])
  return _.range(col0, col1)
}

function createTileUrl({baseUrl, layerId, matrixSetId, tileSetId, row, column}) {
  const format = 'image/png'
  const params = {
    layer: layerId,
    style: '',
    tilematrixset: matrixSetId,
    Service: 'WMTS',
    Request: 'GetTile',
    Version: '1.0.0',
    Format: format,
    TileMatrix: tileSetId,
    TileCol: column,
    TileRow: row
  }
  const wmtsBase = url.parse(baseUrl)
  const tileUrl = url.format(_.extend(wmtsBase, {query: params}))
  return tileUrl
}


function retry({source, retries = 0}) {
  var retriesDone = 0
  function run() {
    const result = source(retriesDone + 1)
    return result.catch(e => {
      console.log('Retry failed', retriesDone)
      if (retriesDone < retries) {
        retriesDone = retriesDone + 1
        return run()
      } else {
        return Promise.reject(e)
      }
    })
  }
  return run()
}
