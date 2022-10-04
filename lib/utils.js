/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
const _ = require("lodash")
const fs = require("fs")

const makeIndent = (x) =>
   Array.from({ length: x * 3 })
      .fill(" ")
      .join("")

function getIndent(line) {
   const match = line.replace(/^( *)#+ /, "$1").match(/^\s+/)
   return match && match.length && match[0].length ? match[0].length / 3 : 0
}

/**
 * @param text {String}
 * @returns {import('./Line').Line[]}
 * */
function linify(text) {
   let previousLine
   const previousLines = {}
   const rootHeaders = []
   return text
      .split("\n")
      .map((textLine) => ({
         text: textLine,
         isEmpty: !/\S/.test(textLine),
         indent: getIndent(textLine),
      }))
      .map((line, index, lines) => {
         if (line.isEmpty)
            return {
               ...line,
               children: [],
               isHeader: false,
               parent: null,
               peers: [],
            }

         const nextLine = lines[index + 1]

         const isHeader =
            !line.isEmpty && // this line isn't empty
            nextLine && // the next line isn't empty
            !nextLine.isEmpty &&
            !/#* +-/.test(line.text) && // the line isn't a bullet point
            !/#* +\d+\./.test(line.text) && // the line isn't a numbered list
            nextLine.indent > line.indent // the next line is tabbed under this one

         // Has this line moved the intent left or right?

         const parent = previousLines[line.indent - 1] || null

         // let parent = null
         // if (previousLine) {
         //    const lineMovesIndentLeft = !previousLine.isEmpty && line.indent < previousLine.indent
         //    const lineMovesIndentRight = !previousLine.isEmpty && line.indent > previousLine.indent

         //    if (!lineMovesIndentLeft && !lineMovesIndentRight) {
         //       parent = previousLine.parent // no change
         //    } else if (lineMovesIndentRight) {
         //       parent = previousLine // line indented from previous
         //    } else if (lineMovesIndentLeft) {
         //       parent = previousLines[line.indent] // line outdented from previous
         //    }
         // }

         const fullLine = {
            ...line,
            children: [],
            isHeader,
            parent,
            peers: parent ? parent.children : rootHeaders,
         }

         if (parent) parent.children.push(fullLine)
         else rootHeaders.push(fullLine)

         previousLines[line.indent] = fullLine

         return fullLine
      })
}

/**
 * @param {import('./Line').Line[]} lines
 * @param {string | RegExp} identifier
 */
function findLine(lines, identifier) {
   return lines.find((line) => (_.isRegExp(identifier) ? identifier.test(line.text) : line.text.includes(identifier)))
}

/*

*/
function blankLine(line, text) {
   return {
      text: text || "",
      indent: 0,
      isHeader: false,
      parent: null,
      peers: [],
      children: [],
      isEmpty: true,
   }
}

// Takes a list of lines and a "block identifier"
// A block identifier is either a sting, a regex, or an array of either
// If it's an array, it looks for nested blocks
// returns the header line
/**
 * @param {import('./Line').Line[]} lines
 * @param {string | RegExp | (string | RegExp)[]} blockIdentifier
 * @param {boolean} createBlockIfMissing
 * @returns {import('./Line').Line} header
 */
function findBlock(lines, blockIdentifier, createBlockIfMissing) {
   const identifiers = Array.isArray(blockIdentifier) ? blockIdentifier : [blockIdentifier]

   let parent = null

   for (const identifier of identifiers) {
      const linesSubset = parent ? parent.children : lines // lines to search inside

      let block = findLine(linesSubset, identifier)
      if (!block) {
         if (!createBlockIfMissing) throw new Error(`Cannot find block for block identifier "${identifier}"`)
         if (_.isRegExp(identifier)) throw new Error(`Cannot create block if identifier is regex "${identifier}"`)

         // If no block identifier is found, create the block and return it's info

         // Make some space for the new block if needed
         // if (_.last(linesSubset).text !== "\n") injectAfter({ lines, toInject: blankLine()})

         // Create block
         block = {
            children: [],
            peers: linesSubset,
            indent: 0,
            parent: parent,
            text: identifier,
            isEmpty: false,
            isHeader: false,
         }
         indentLines([block], parent ? parent.indent + 1 : 0)

         injectAfter({
            lines,
            toInject: block,
            after: _.last(linesSubset),
         })
      }

      // if it did find it, restrict the search scope of the next one to it's children
      // This will be inadequate in double tab situations, but okay for now
      parent = block
   }

   // @ts-ignore
   return parent
}

/**
 * @returns {import('./Line').Line | undefined} line
 */
function nextLine({ lines, line, n }) {
   const index = lines.indexOf(line)
   return lines[index + n]
}

// where "youngest" is the last in the children array
function youngestDescendent(line) {
   let youngestLine = line
   while (youngestLine.children.length) {
      return youngestDescendent(_.last(youngestLine.children))
   }
   return youngestLine
}

/**
 * @param {"append"|"prepend"} method
 * @param {{
 *    file?:String,
 *    spacer?:boolean | (
 *       (args: {
 *          linesInjected:import('./Line').Line[],
 *          lineBefore?:import('./Line').Line,
 *          lineAfter?:import('./Line').Line
 *       }) => boolean
 *    ),
 *    blockIdentifier?:String | RegExp | (string | RegExp)[],
 *    text?:String,
 *    toInject:String,
 *    createBlockIfMissing?:boolean,
 *    indent?:boolean
 * }} options
 * */
function inject(method, { file, spacer, blockIdentifier, text, toInject, createBlockIfMissing, indent }) {
   // set up lines
   if (text === undefined && !file) throw new Error("Text or path must be defined")

   // @ts-ignore
   const lines = linify(text === undefined ? fs.readFileSync(file).toString() : text)
   const linesToInject = linify(toInject)

   // get block start and end
   const header = blockIdentifier ? findBlock(lines, blockIdentifier, !!createBlockIfMissing) : null

   /*
      0: block start <--- block start = 0
      1:    line 1   <--- append to block injection point
      2:    line 2
      3:    line 3   <--- block end = 3
      4: \n          <--- prepend to block injection point
   */
   const injectionPoint = (() => {
      if (method === "prepend") {
         if (!header) {
            return lines[0]
         } else {
            return header
         }
      } else if (method === "append") {
         if (!header) {
            return _.last(lines)
         } else {
            return youngestDescendent(header)
         }
      } else {
         throw new Error(`Unrecognised method "${method}"`)
      }
   })()

   // figure out whether or not to pad what we're injecting
   const addSpace = (() => {
      if (typeof spacer === "function") {
         return spacer({
            linesInjected: linesToInject,
            lineBefore: injectionPoint,
            lineAfter: nextLine({ lines, line: injectionPoint, n: 1 }),
         })
      }
      if (header && !header.children.length) {
         return false // even if you'd normally space, don't it's a fresh block
      }
      return spacer === true
   })()

   // Adjust the indent of the lines to inject based on the block they're being injected into
   if (header && indent !== false) {
      indentLines(linesToInject, header.indent + 1)
   }

   if (addSpace) {
      if (method === "append") {
         injectBefore({ lines: linesToInject, toInject: blankLine() }) // if appending, add blank to start of lines to inject
      } else {
         injectAfter({ lines: linesToInject, toInject: blankLine() }) // if prepending, add blank to end of lines to inject
      }
   }

   // inject content
   injectAfter({ lines, toInject: linesToInject, after: injectionPoint })

   const newText = linesToText(lines)

   if (file) {
      fs.writeFileSync(file, newText)
   }

   return newText
}

/**
 * @param {import("./Line").Line[]} lines
 * @param {number} n
 */
function indentLines(lines, n) {
   lines.forEach((line) => {
      line.text = `${makeIndent(n)}${line.text}`
      line.indent += n
   })
}

function indentText(text, n) {
   const lines = linify(text)
   indentLines(lines, n)
   return linesToText(lines)
}

function linesToText(lines) {
   return lines.map((line) => line.text).join("\n")
}

/**
 * @param {{
 *    lines: import("./Line").Line[],
 *    toInject:import("./Line").Line | import("./Line").Line[],
 *    after?:import("./Line").Line}
 * } opts
 */
function injectAfter({ lines, toInject, after }) {
   const index = !after ? lines.length - 1 : lines.indexOf(after)
   if (index === -1) throw new Error("Cannot find lineAfterWhichToInject in lines")

   if (Array.isArray(toInject)) {
      lines.splice(index + 1, 0, ...toInject)
   } else {
      lines.splice(index + 1, 0, toInject)
   }
}

/**
 * @param {{
 *    lines: import("./Line").Line[],
 *    toInject:import("./Line").Line | import("./Line").Line[],
 *    before?:import("./Line").Line}
 * } opts
 */
function injectBefore({ lines, toInject, before }) {
   const index = !before ? 0 : lines.indexOf(before)
   if (index === -1) throw new Error("Cannot find lineAfterWhichToInject in lines")

   if (Array.isArray(toInject)) {
      lines.splice(index, 0, ...toInject)
   } else {
      lines.splice(index, 0, toInject)
   }
}

/* takes a uniform array of lines and chunks them by regex */
/**
 * @param {string} _lines
 * @param {{ test: (arg0: import("./Line").Line) => any; }} regex
 */
function chunkify(_lines, regex) {
   const lines = linify(_lines)

   const chunks = []

   let chunkStart

   lines.forEach((line, i) => {
      if (regex.test(line)) {
         if (chunkStart !== undefined) {
            chunks.push(lines.slice(chunkStart, i))
         }

         chunkStart = i
      }
   })

   return chunks
}

module.exports = {
   findBlock,
   linify,
   getIndent,
   chunkify,
   inject,
   indentText,
}
