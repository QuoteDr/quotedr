import bundled from '../../../qdr-handbook.json' with { type: 'json' };
import { searchHandbook, validHandbook } from '../../../handbook-search.mjs';

let cache: {book: typeof bundled; until: number; mode: string} | undefined;
let loading: Promise<void> | undefined;
async function refresh() {
  try {
    // Fixed first-party URL only: never fetch a URL supplied by a user or the model.
    const response = await fetch('https://quotedr.io/qdr-handbook.json', {redirect:'error', signal:AbortSignal.timeout(2500)});
    if (!response.ok || !response.body) throw new Error('Handbook unavailable');
    const reader=response.body.getReader(); let size=0, text=''; const decoder=new TextDecoder();
    try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>200000) throw new Error('Handbook too large'); text+=decoder.decode(value,{stream:true}); } }
    finally { await reader.cancel(); }
    const book=JSON.parse(text+decoder.decode());
    if(!validHandbook(book) || book.version.localeCompare(bundled.version, undefined, {numeric:true}) < 0) throw new Error('Invalid or older handbook');
    cache={book, until:Date.now()+60000, mode:'published'};
  } catch {
    cache={book:bundled, until:Date.now()+30000, mode:'bundled-fallback'};
  }
}
export async function retrieveHandbook(messages: {role:string;content:unknown}[]) {
  if(!cache || cache.until<Date.now()) {
    if(!loading) loading=refresh().finally(()=>{loading=undefined;});
    await loading;
  }
  const questions=messages.filter(m=>m.role==='user').map(m=>String(m.content||'').slice(0,4000));
  let characters=0;
  const articles=searchHandbook(cache!.book,questions.at(-1)||'',questions.slice(-3,-1).join(' ')).filter((a: {body:string}) => {
    characters+=a.body.length; return characters<=16000;
  });
  return {articles, version:cache!.book.version, mode:cache!.mode};
}
