import { useEffect, useRef, useState } from 'react';
import type { Place } from '../shared/types';
import { MapPin } from 'lucide-react';
import { Notice } from './components';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export default function MapView({places,styleUrl}:{places:Place[];styleUrl:string}){
  const root=useRef<HTMLDivElement>(null);const [error,setError]=useState('');
  const pinned=places.filter(p=>p.premises!=='none'&&p.coordinates_checked&&p.latitude!==null&&p.longitude!==null);
  useEffect(()=>{
    if(!styleUrl||!root.current)return;
    let map:import('maplibre-gl').Map|undefined;let cancelled=false;
    import('maplibre-gl').then(({Map,NavigationControl,Popup,setWorkerUrl})=>{
      if(cancelled)return;
      setWorkerUrl(mapWorkerUrl);
      map=new Map({container:root.current!,style:styleUrl,center:[14.4,35.94],zoom:10});map.addControl(new NavigationControl());
      map.on('error',()=>setError('The map could not load. You can still find places in the list.'));
      map.on('load',()=>{
        map!.addSource('places',{type:'geojson',cluster:true,clusterRadius:40,data:{type:'FeatureCollection',features:pinned.map(p=>({type:'Feature',properties:{id:p.id,name:p.name,slug:p.slug},geometry:{type:'Point',coordinates:[p.longitude!,p.latitude!]}}))}});
        map!.addLayer({id:'clusters',type:'circle',source:'places',filter:['has','point_count'],paint:{'circle-color':'#234e43','circle-radius':22}});
        map!.addLayer({id:'cluster-count',type:'symbol',source:'places',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':13},paint:{'text-color':'#ffffff'}});
        map!.addLayer({id:'points',type:'circle',source:'places',filter:['!',['has','point_count']],paint:{'circle-color':'#b26643','circle-radius':9,'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
        map!.on('click','clusters',async e=>{const f=e.features?.[0];if(!f)return;const source=map!.getSource('places') as import('maplibre-gl').GeoJSONSource;const zoom=await source.getClusterExpansionZoom(f.properties.cluster_id);map!.easeTo({center:(f.geometry as {coordinates:number[]}).coordinates as [number,number],zoom});});
        map!.on('click','points',e=>{const f=e.features?.[0];if(!f)return;const el=document.createElement('a');el.textContent=f.properties.name;el.href=`/places/${encodeURIComponent(f.properties.slug)}`;el.className='map-link';new Popup().setLngLat((f.geometry as {coordinates:number[]}).coordinates as [number,number]).setDOMContent(el).addTo(map!);});
        map!.on('mouseenter','points',()=>{map!.getCanvas().style.cursor='pointer';});map!.on('mouseleave','points',()=>{map!.getCanvas().style.cursor='';});
      });
    }).catch(()=>setError('The map could not load. Please use the list.'));
    return()=>{cancelled=true;map?.remove();};
  },[styleUrl,places]);
  return <section className="map-section">{!styleUrl?<div className="map-unavailable"><MapPin size={36}/><h2>A better view of the islands</h2><p>The interactive map will be available once a map provider is connected. All places are available in the list.</p><a className="button" href="/">Browse places</a></div>:<div ref={root} className="map-canvas" aria-label="Map of places in Malta and Gozo"/>}{error&&<Notice error>{error}</Notice>}<p className="small muted">{pinned.length} checked map pins · {places.length-pinned.length} businesses without a public checked pin. Distances are approximate, not road or ferry travel times.</p></section>;
}
