#!/usr/bin/env node
const _ = require('lodash')
const program = require('commander')
const Promise = require('bluebird')
const WmtsToMbtiles = require('./src/wmts-to-mbtiles')
const {getCapabilities} = require('./src/wmts-parser')

const defaultWMTSUrl = 'https://julkinen.liikennevirasto.fi/rasteripalvelu/service/wmts'
const defaultLayer = 'liikennevirasto:Rannikkokartat public'
const defaultZoom = 10

const cmd = program
  .option('--layers', 'List WMTS service layers')
  .option('--layer [id]', 'Get layer', defaultLayer)
  .option('--output [mbtiles]', 'Output file')
  .option('--zoom [zoom]', 'Zoom level', defaultZoom)
  .option('--input [url]', 'WMTS service URL', defaultWMTSUrl)
  .option('--bbox [w s e n]', 'Latitude and longitude values, eg. "23.411 59.731 26.850 60.562"')
  .parse(process.argv)

if (cmd.layers) {
  printLayers()
} else {
  const {lat, long} = cmd
  const layer = cmd.layer
  const bbox = cmd.bbox ? cmd.bbox.split(' ').map(parseFloat) : undefined
  if (bbox) {
    console.log('Requested bounds:', bbox)
  }
  const zoom = parseInt(cmd.zoom)
  const defaultMbtilesFile = `./${_.snakeCase(_.deburr(layer))}-${zoom}.mbtiles`

  WmtsToMbtiles({
    mbtilesFile: cmd.output || defaultMbtilesFile,
    wmtsUrl: cmd.input,
    layer,
    zoom,
    bbox
  })
}

function printLayers() {
  console.log('Fetching layers ....')
  getCapabilities(cmd.input)
    .then(capabilities => {
      return _.map(capabilities.layers, l => _.pick(l, ['id', 'title']))
    })
    .then(layers => {
      const maxLen = _.get(_.maxBy(layers, l => l.id.length), 'id.length')
      console.log('Layers:')
      console.log(`${_.map(layers, l => `${_.padEnd(l.id, maxLen)} :: ${l.title}`).join('\n')}`)
      process.exit(0)
    })
}
