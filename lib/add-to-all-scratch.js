const moment = require('moment')
const fs = require('fs')

function addToAllScratch(text) {
   const existingScratchStamp = text.match(/\d{1,2}-\d{1,2}-\d{1,2} \d{1,2}\.\d{1,2}: /)

   let scratch
   if (existingScratchStamp) {
      scratch = `\n${existingScratchStamp[0]}: ${text.replace(existingScratchStamp[0], '')}`
   } else {
      scratch = `\n${moment().format('DD-MM-YY HH.mm')}: ${text}`
   }

   fs.appendFileSync('C:/sync/documents/scratch_pads/all-scratch.md', scratch)
}

module.exports = { addToAllScratch }
