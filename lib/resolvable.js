function resolvable() {
   let resolve = (x) => {}
   let reject

   const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
   })

   return { promise, resolve, reject }
}

module.exports = { resolvable }
