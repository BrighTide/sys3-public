export interface Line {
   text:string,
   indent:number,
   isHeader:boolean,
   parent:Line|null
   peers:Line[]
   children:Line[]
   isEmpty:boolean
}
