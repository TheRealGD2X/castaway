// Cost estimates change only after completed, observed work. Welford variance keeps uncertainty.
import { clamp } from '../core/dmath.js';
export function estimateCost(M,key,prior){const e=M.experience?.[key];if(!e)return prior;const confidence=e.n/(e.n+4);return prior*(1+confidence*(clamp(e.mean,.25,4)-1));}
export function learnCost(M,key,prior,actual,predicted=prior){if(!(prior>0&&actual>0))return;M.experience||={};const e=M.experience[key]||{n:0,mean:1,m2:0};const ratio=actual/prior;e.n++;const d=ratio-e.mean;e.mean+=d/e.n;e.m2+=d*(ratio-e.mean);e.last={predicted,actual,error:actual-predicted};M.experience[key]=e;}
