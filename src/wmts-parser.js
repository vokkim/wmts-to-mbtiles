const request = require('request-promise')
const _ = require('lodash')
const Promise = require('bluebird')
const parseString = Promise.promisify(require('xml2js').parseString)
const {tileColumnToLongitude, tileRowToLatitude} = require('./utils')

function getCapabilities(wmtsUrl) {
  const capabilitiesUrl = wmtsUrl + '?request=getcapabilities'
  return request
    .get(capabilitiesUrl)
    .then(text => parseString(text))
    .then(xmlAsJson => {
      const layerDefinitions = getLayerDefinitionsFromWMTSCapabilities(xmlAsJson)
      return {
        layers: layerDefinitions
      }
    })
}

function getWSG84MatrixSetDefinitions(layer) {
  const WGS84Set = _.find(layer.TileMatrixSetLink, t => (t.TileMatrixSet[0] || '').startsWith('WGS84'))
  if (!WGS84Set) {
    console.info(`No WSG84 tileset?`)
    return null
  }
  const tileSets = _.map(WGS84Set.TileMatrixSetLimits[0].TileMatrixLimits, t => {
    const id = _.first(t.TileMatrix)
    const zoom = parseInt(_.last((_.first(t.TileMatrix) || '').split(':')))
    if (!id || !_.isFinite(zoom)) {
      console.info(`No tile set for ${JSON.stringify(t)}`)
      return null
    }
    const minTileRow = parseXmlNodeToInteger(t.MinTileRow)
    const maxTileRow = parseXmlNodeToInteger(t.MaxTileRow)
    const minTileColumn = parseXmlNodeToInteger(t.MinTileCol)
    const maxTileColumn = parseXmlNodeToInteger(t.MaxTileCol)
    const tileCount = (maxTileRow - minTileRow + 1) * (maxTileColumn - minTileColumn + 1)
    return {
      id,
      zoom,
      tileCount,
      minTileRow,
      maxTileRow,
      minTileColumn,
      maxTileColumn,
      bounds: [
        tileColumnToLongitude(minTileColumn, zoom),
        tileRowToLatitude(maxTileRow+1, zoom),
        tileColumnToLongitude(maxTileColumn+1, zoom),
        tileRowToLatitude(minTileRow, zoom)
      ]
    }
  })
  return {
    id: WGS84Set.TileMatrixSet[0],
    tileSets
  }
}

function getLayerDefinitionsFromWMTSCapabilities(xmlAsJson) {
  const {Capabilities} = xmlAsJson
  const {Contents} = Capabilities
  const Layers = Contents[0].Layer
  const layerDefinitions = _.map(Layers, l => {

    return {
      title: _.first(l['ows:Title']),
      id: _.first(l['ows:Identifier']),
      format: _.first(l.Format),
      wsg84: getWSG84MatrixSetDefinitions(l)
    }
  })
  return layerDefinitions
}

function parseXmlNodeToInteger(val) {
  const valueAsInt = parseInt(val[0])
  return _.isFinite(valueAsInt) ? valueAsInt : null
}

module.exports = {
  getCapabilities,
  getLayerDefinitionsFromWMTSCapabilities
}