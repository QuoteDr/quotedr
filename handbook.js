import {searchHandbook,validHandbook} from './handbook-search.mjs';
const status=document.getElementById('status'), container=document.getElementById('articles'), input=document.getElementById('search');
try {
 const response=await fetch('qdr-handbook.json'); if(!response.ok) throw new Error();
 const book=await response.json(); if(!validHandbook(book)) throw new Error();
 function render(){
  const rows=input.value.trim()?searchHandbook(book,input.value):book.articles;
  container.replaceChildren(); status.textContent=rows.length+' articles · Handbook '+book.version;
  for(const a of rows){const section=document.createElement('article');section.id=a.id;const h=document.createElement('h2');h.textContent=a.title;const meta=document.createElement('small');meta.textContent='Reviewed '+a.verifiedAt+' · Release '+a.release;const p=document.createElement('p');p.textContent=a.body;section.append(h,meta,p);container.append(section);}
 }
 function jump(){input.value='';render();document.getElementById(location.hash.slice(1))?.scrollIntoView();}
 input.addEventListener('input',render);window.addEventListener('hashchange',jump);jump();
} catch {status.textContent='The handbook could not be loaded. Please try again later.';}
