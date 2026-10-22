// Geocode every listing in index.html: postcodes.io for the postcode centre,
// Nominatim for the named venue, keep Nominatim when it agrees with the postcode.
import fs from "node:fs";
const file = process.argv[2];
let html = fs.readFileSync(file, "utf8");
const UA = "BedInTheShed-WhatsOn/1.0 (hello@bedintheshed.co.uk)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const km = (a,b) => { const R=6371, t=x=>x*Math.PI/180; const dl=t(b.lat-a.lat), dg=t(b.lng-a.lng); const h=Math.sin(dl/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dg/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };

async function postcode(pc){
  const r = await fetch("https://api.postcodes.io/postcodes/"+encodeURIComponent(pc), {headers:{"User-Agent":UA}});
  if(!r.ok) return null; const j = await r.json();
  return j.result ? {lat:j.result.latitude, lng:j.result.longitude} : null;
}
const GOOD=/theme_park|place_of_worship|university|college|museum|cinema|theatre|attraction|cafe|pub|restaurant|farm|castle|ruins|park|garden|shop|hotel|bar|viewpoint|archaeological|monument|zoo|library|railway|station|tourism|heritage|house|hall|priory|church|yes/i;
async function nominatim(q){
  await sleep(1100);
  const u = "https://nominatim.openstreetmap.org/search?format=json&limit=3&countrycodes=gb&q="+encodeURIComponent(q);
  const r = await fetch(u, {headers:{"User-Agent":UA,"Accept-Language":"en-GB"}});
  if(!r.ok) return []; return (await r.json()).map(x=>({lat:+x.lat,lng:+x.lon,name:x.display_name,type:x.type}));
}

// Every object that carries lat/lng + addr; grab a name if one precedes it in the same object.
const re = /\{([^{}]*?)lat:(-?\d+\.\d+),\s*lng:(-?\d+\.\d+)([^{}]*?)\}/g;
const targets = [];
for (const m of html.matchAll(re)) {
  const body = m[1]+m[4];
  const addr = (body.match(/addr:"([^"]+)"/)||[])[1]; if(!addr) continue;
  const name = (body.match(/name:"([^"]+)"/)||[])[1] || "";
  targets.push({full:m[0], lat:m[2], lng:m[3], addr, name});
}
targets.push({full:'const HOME = {lat:54.8098, lng:-1.6948};', lat:"54.8098", lng:"-1.6948", addr:"The Firs, Wallnook Lane, Langley Park, Durham DH7 9TW", name:"The Firs", isHome:true});

const report = [];
for (const t of targets) {
  const pc = (t.addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i)||[])[1];
  let best=null, how="";
  const pcPt = pc ? await postcode(pc) : null;
  if (pcPt) { best=pcPt; how="postcode "+pc; }
  const nameQ = t.name.replace(/\s[—–-].*$/,"").replace(/^(The )/,"");
  if (nameQ && !t.isHome && !/village|walk|path|venues/i.test(nameQ)) {
    const hits = await nominatim(nameQ+(pc?", "+pc:"")+(pc?"":", Durham"));
    let hit = hits.find(h => GOOD.test(h.type) && (!pcPt || km(h,pcPt) < 1.5));
    if (!hit && pc) { const h2 = await nominatim(nameQ+", County Durham"); hit = h2.find(h => GOOD.test(h.type) && (!pcPt || km(h,pcPt) < 2.5)); }
    if (hit) { best=hit; how="venue match ("+hit.type+")"+(pcPt?", "+km(hit,pcPt).toFixed(2)+" km from postcode":""); }
  }
  if (!best) { report.push({name:t.name, addr:t.addr, result:"NO MATCH — kept"}); continue; }
  const moved = km({lat:+t.lat,lng:+t.lng}, best);
  const repl = t.full.replace(/lat:-?\d+\.\d+,\s*lng:-?\d+\.\d+/, "lat:"+best.lat.toFixed(5)+", lng:"+best.lng.toFixed(5));
  html = html.split(t.full).join(repl);
  report.push({name:t.name||t.addr.split(",")[0], how, movedKm:+moved.toFixed(2)});
}
fs.writeFileSync(file, html);
console.log(JSON.stringify(report, null, 1));
