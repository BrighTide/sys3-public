const moment = require("moment")
const fs = require("fs")
const _ = require("lodash")
const rerequire = require("./rerequire")
const { inject, indentText } = require("./utils")

const { log } = rerequire("./log")

// const JOURNAL = __dirname + '/test'
const JOURNAL = "C:/sync/documents/notes/journal"

function weeklyJournalCheck(week) {
   log("Weekly journal check...")
   const time = week ? moment().isoWeek(week).isoWeekday(1) : moment() // if passed week use that, else do now

   // check year exists
   const yearPath = `${JOURNAL}/${time.year()}`
   if (!fs.existsSync(yearPath)) {
      log("Year does not exist, creating...")
      fs.mkdirSync(yearPath)
   }

   // Figure out what the latest week should be
   const newWeek = time.isoWeekday() === 7 ? time.isoWeek() + 1 : time.isoWeek()
   const newWeekDigit = `${newWeek < 10 ? `0${newWeek.toString()}` : newWeek.toString()}`
   const entryPath = `${yearPath}/${time.year()}-${newWeekDigit}.md`

   // Template and write new journal entry for week if it doesn't exist
   if (!fs.existsSync(entryPath)) {
      log("Creating new weekly entry", entryPath)
      fs.writeFileSync(
         entryPath,
         _.template(fs.readFileSync(`${JOURNAL}/review-template.md`).toString())({
            date: moment().isoWeek(newWeek).isoWeekday(7).format("DD/MM/YYYY"),
         })
      )
   }

   return entryPath
}

function getHeaderInfo(text) {
   // Get date and day-num
   const dayMatch = /#(.+) /.exec(text)
   if (!dayMatch || !dayMatch[0]) throw new Error("Could not find dayNum")

   const dateMatch = /\d\d\/\d\d\/\d\d\d\d/.exec(text)
   if (!dateMatch || !dateMatch[0]) throw new Error("Could not find date")

   return { dayNum: Number(dayMatch[1]), date: dateMatch[0] }
}

// runs at 4am every day, flushes contents of today log to weekly journal and writes new content
function dailyJournalCheck() {
   log("Daily journal check...")
   const today = fs.readFileSync(`${JOURNAL}/today.md`).toString().trim()

   const { dayNum, date } = getHeaderInfo(today)
   const time = moment(date, "DD/MM/YYYY")

   // Ensure weekly journal is cycled
   const weeklyJournalPath = weeklyJournalCheck(time.isoWeek())

   // 1. Take the contents of "today" and move it into "yesterday"
   // 2. take the stuff in tomorrow.md, and add to today.md as "messages to future self"

   // Take contents of yesterday.md and wack it under yesterday's daily log
   // const { dayNum: yesterdayDayNum, date: yesterdayDate } = getHeaderInfo(today)
   // log("Appending yesterday.md to yesterdays log", weeklyJournalPath)
   // inject("append", {
   //    file: weeklyJournalPath,
   //    toInject: today,
   //    blockIdentifier: [yesterdayDate, ],
   //    spacer: true,
   // })

   const textFromTodayMD = fs.readFileSync(`${JOURNAL}/today.md`).toString()

   log("Writing today.md into weekly journal", weeklyJournalPath)
   inject("append", {
      file: weeklyJournalPath,
      toInject: today,
      blockIdentifier: "🐪 Nomad Log",
      spacer: true,
   })

   // Prep variables for templating out "today"
   const next = time.clone().add(1, "day")
   const nextDay = dayNum + 1
   const textFromTomorrowMD = fs.readFileSync(`${JOURNAL}/tomorrow.md`).toString().trim()

   const fromYoungerBrother =
      textFromTomorrowMD.split("\n").length > 1
         ? textFromTomorrowMD.replace("📜 Scratch", "📤 From: Younger Brother")
         : ""

   // Use the daily log template stamp out a fresh "today"
   log("Writing to today log", weeklyJournalPath, "today:", today, "tomorrow.md:", fromYoungerBrother)
   const templateText = fs.readFileSync(`${JOURNAL}/daily-log-template.md`).toString()
   const toWrite = _.template(templateText)({
      nextDayNumber: nextDay < 10 ? `0${nextDay.toString()}` : nextDay,
      day: next.format("ddd"),
      date: next.format("DD/MM/YYYY"),
      fromYoungerBrother,
      indentText,
   })
      .replace(/\n.*\$delLine.*/m, "")
      .replace(/\n.*\$ % .*/m, "")

   // Write to md files
   fs.writeFileSync(`${JOURNAL}/yesterday.md`, textFromTodayMD)
   fs.writeFileSync(`${JOURNAL}/today.md`, toWrite)
   fs.writeFileSync(`${JOURNAL}/tomorrow.md`, "📜 Scratch\n   ")

   // clear tomorrow.md
   // move yesterday into it's note
}

function addToDailyLog(text, scratch) {
   if (!text) return

   inject("append", {
      file: `${JOURNAL}/today.md`,
      blockIdentifier: [/#/, "📜 Scratch"],
      createBlockIfMissing: true,
      toInject: `${moment().format("HH:mm")} ${text}`,
   })
}

function nameDay(name) {
   const today = fs.readFileSync(`${JOURNAL}/today.md`).toString()

   fs.writeFileSync(`${JOURNAL}/today.md`, today.replace("****", `**${name}**`))
}

module.exports = {
   dailyJournalCheck,
   weeklyJournalCheck,
   addToDailyLog,
   nameDay,
}

// dailyJournalCheck()
// weeklyJournalCheck()
