'use client';
import { useEffect, useRef } from 'react';
import { AreaSeries, createChart, ColorType, type UTCTimestamp } from 'lightweight-charts';
export type PricePoint={time:number;value:number};
export default function PriceChart({points}:{points:PricePoint[]}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const chart=createChart(ref.current,{autoSize:true,height:230,layout:{background:{type:ColorType.Solid,color:'#1d1f28'},textColor:'#a5afc1',fontFamily:'Inter Variable',attributionLogo:true},grid:{vertLines:{visible:false},horzLines:{color:'#2c3342'}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false},crosshair:{vertLine:{color:'#7c98e2'},horzLine:{color:'#7c98e2'}}});
    const series=chart.addSeries(AreaSeries,{lineColor:'#658bff',topColor:'rgba(80,120,255,0.17)',bottomColor:'rgba(80,120,255,0.01)',lineWidth:2,priceFormat:{type:'custom',formatter:(value:number)=>`${Math.round(value*100)}¢`}});
    series.setData(points.map(p=>({time:p.time as UTCTimestamp,value:p.value})));chart.timeScale().fitContent();
    return ()=>chart.remove();
  },[points]);
  return <div className="chart-wrap"><div ref={ref} aria-label="Observed Gemini YES price during this session"/>{points.length<2?<div className="chart-empty">Waiting for live observations<span>Chart builds from this session. No synthetic history.</span></div>:null}</div>;
}
