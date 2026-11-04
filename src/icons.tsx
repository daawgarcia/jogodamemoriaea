export function CardIcon({ face }: { face: number }) {
  const paths = [
    <path key="tooth" d="M25 14c-9-5-17 1-15 13 1 9 5 25 10 25 4 0 2-17 8-17s4 17 8 17c5 0 9-16 10-25 2-12-6-18-15-13l-3 2z" />,
    <g key="aligner"><path d="M9 22c3 23 35 23 38 0l-4-7c-8 9-22 9-30 0z" /><path d="M17 25v8m8-6v10m8-10v10m8-12v8" /></g>,
    <g key="smile"><circle cx="28" cy="28" r="20" /><path d="M17 31c4 11 18 11 22 0M20 21h1m14 0h1" /></g>,
    <path key="star" d="m28 7 6 14 15 2-11 11 3 15-13-7-13 7 3-15L7 23l15-2z" />,
    <g key="diamond"><path d="m16 13-9 12 21 25 21-25-9-12zM7 25h42M16 13l12 37 12-37M16 13h24" /></g>,
    <g key="shield"><path d="M28 7 10 14v14c0 12 18 22 18 22s18-10 18-22V14z" /><path d="m19 28 6 6 12-13" /></g>
  ];
  return <svg viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[face]}</svg>;
}
