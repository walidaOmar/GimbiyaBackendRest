import assert from "node:assert/strict";
import { resolveRate, listedPriceKobo, buildOrderBreakdown, entitlementsForGroup } from "../policy/pricing.v1.js";
import { checkCap, effectiveTier } from "../policy/entitlements.v1.js";
import { tiersForViewer, canBuyTier } from "../policy/marketVisibility.v1.js";
const cfg = { platformFeePct:1.5, wholesaleCommissionPct:2.5, level2CommissionPct:3, nodeCommissionPct:{"Ado bayero mall":5.5,"Tafawa balewa refinery":5,"Sardauna market":4.5},
  splitReferred:{affiliate:50,platform:20,merchant:20,rider:10}, splitOrganic:{affiliate:0,platform:30,merchant:60,rider:10}, deliveryFeeKobo:150000 };
assert.equal(resolveRate(cfg,{node:"Ado bayero mall",floor:"LEVEL_1",marketTier:"consumer"}).pct,5.5);
assert.equal(resolveRate(cfg,{node:"Ado bayero mall",floor:"LEVEL_2",marketTier:"consumer"}).pct,3);
assert.equal(resolveRate(cfg,{node:"Ado bayero mall",floor:"LEVEL_2",marketTier:"wholesale"}).pct,2.5);
assert.equal(resolveRate({...cfg,ratePrecedence:["level2","wholesale","node"]},{node:"x",floor:"LEVEL_2",marketTier:"wholesale"}).pct,3);
assert.equal(listedPriceKobo(1000000,5.5),1055000);
let seed=7; const rnd=()=> (seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
for(let n=0;n<2000;n++){
  const nm=1+Math.floor(rnd()*3), ns=Math.floor(rnd()*3);
  const productLines=[...Array(nm)].flatMap((_,m)=>[...Array(1+Math.floor(rnd()*3))].map(()=>{const base=1+Math.floor(rnd()*5e6);const q=1+Math.floor(rnd()*9);return{merchantId:"m"+m,quantity:q,baseUnitKobo:base,listedUnitKobo:listedPriceKobo(base,[2.5,3,4.5,5,5.5][Math.floor(rnd()*5)])}}));
  const serviceLines=[...Array(ns)].map((_,i)=>({providerId:"s"+i,priceKobo:1+Math.floor(rnd()*2e6)}));
  const aff=rnd()>0.5?"aff":null;
  const {groups,totals}=buildOrderBreakdown({config:cfg,productLines,serviceLines,affiliateId:aff});
  for(const g of groups){
    const rows=entitlementsForGroup(g,{affiliateId:aff,riderId:rnd()>0.5?"r":null});
    assert.equal(rows.reduce((s,r)=>s+r.amountKobo,0),g.customerKobo,"group conserves");
    assert.ok(rows.every(r=>r.amountKobo>0&&Number.isInteger(r.amountKobo)));
  }
  assert.equal(groups.reduce((s,g)=>s+g.customerKobo,0),totals.grossTotalKobo);
  assert.equal(totals.productSubtotalKobo+totals.serviceSubtotalKobo+totals.feeKobo+totals.deliveryFeeKobo,totals.grossTotalKobo);
}
assert.deepEqual(tiersForViewer("retailer"),["wholesale"]);
assert.ok(!canBuyTier("consumer","wholesale"));
assert.equal(checkCap("BASIC","products",5).ok,false);
assert.equal(effectiveTier({subscriptionTier:"PRO",subscriptionExpiresAt:new Date(Date.now()-1000)}),"BASIC");
console.log("pricing/entitlement/visibility tests passed");
