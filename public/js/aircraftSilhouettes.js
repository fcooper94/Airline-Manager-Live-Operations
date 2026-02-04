/**
 * Aircraft Silhouettes - Clean line drawings for aircraft types
 * Based on ICAO codes and model names
 */

const aircraftSilhouettes = {
  // Airbus A320 family (narrowbody)
  A320: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <!-- Fuselage -->
    <path d="M10 25 Q5 25 5 26 L5 27 Q5 28 10 28 L175 28 Q180 28 182 26 Q180 24 175 24 L10 24 Q5 24 5 25 Z"/>
    <!-- Windows -->
    <line x1="20" y1="25" x2="160" y2="25" stroke-dasharray="2,3"/>
    <!-- Cockpit windows -->
    <path d="M8 25 L5 26 L8 27"/>
    <!-- Wing -->
    <path d="M70 28 L50 42 L55 42 L95 28"/>
    <path d="M70 24 L85 15 L90 15 L80 24"/>
    <!-- Tail -->
    <path d="M165 24 L170 10 L175 10 L178 24"/>
    <!-- Horizontal stabilizer -->
    <path d="M170 26 L182 22 L185 22 L180 26"/>
    <path d="M170 26 L182 30 L185 30 L180 26"/>
    <!-- Engines -->
    <ellipse cx="65" cy="32" rx="8" ry="3"/>
    <ellipse cx="90" cy="32" rx="8" ry="3"/>
    <!-- Landing gear -->
    <line x1="55" y1="28" x2="55" y2="35"/>
    <circle cx="55" cy="36" r="1.5"/>
    <line x1="130" y1="28" x2="130" y2="35"/>
    <circle cx="130" cy="36" r="1.5"/>
  </svg>`,

  A319: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M15 25 Q10 25 10 26 L10 27 Q10 28 15 28 L170 28 Q175 28 177 26 Q175 24 170 24 L15 24 Q10 24 10 25 Z"/>
    <line x1="25" y1="25" x2="155" y2="25" stroke-dasharray="2,3"/>
    <path d="M13 25 L10 26 L13 27"/>
    <path d="M72 28 L55 40 L60 40 L95 28"/>
    <path d="M72 24 L85 16 L90 16 L82 24"/>
    <path d="M160 24 L165 12 L170 12 L173 24"/>
    <path d="M165 26 L177 22 L180 22 L175 26"/>
    <path d="M165 26 L177 30 L180 30 L175 26"/>
    <ellipse cx="68" cy="32" rx="7" ry="2.5"/>
    <ellipse cx="90" cy="32" rx="7" ry="2.5"/>
    <line x1="58" y1="28" x2="58" y2="34"/>
    <circle cx="58" cy="35" r="1.5"/>
    <line x1="128" y1="28" x2="128" y2="34"/>
    <circle cx="128" cy="35" r="1.5"/>
  </svg>`,

  A321: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 25 Q2 25 2 26 L2 27 Q2 28 5 28 L180 28 Q185 28 187 26 Q185 24 180 24 L5 24 Q2 24 2 25 Z"/>
    <line x1="15" y1="25" x2="165" y2="25" stroke-dasharray="2,3"/>
    <path d="M4 25 L2 26 L4 27"/>
    <path d="M68 28 L48 44 L53 44 L95 28"/>
    <path d="M68 24 L85 14 L90 14 L78 24"/>
    <path d="M170 24 L175 8 L180 8 L183 24"/>
    <path d="M175 26 L190 22 L193 22 L185 26"/>
    <path d="M175 26 L190 30 L193 30 L185 26"/>
    <ellipse cx="62" cy="33" rx="9" ry="3"/>
    <ellipse cx="92" cy="33" rx="9" ry="3"/>
    <line x1="52" y1="28" x2="52" y2="36"/>
    <circle cx="52" cy="37" r="1.5"/>
    <line x1="135" y1="28" x2="135" y2="36"/>
    <circle cx="135" cy="37" r="1.5"/>
  </svg>`,

  // Airbus widebody
  A330: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L180 29 Q185 29 188 26.5 Q185 24 180 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="165" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M65 29 L40 46 L48 46 L100 29"/>
    <path d="M65 24 L88 12 L95 12 L78 24"/>
    <path d="M170 24 L176 6 L182 6 L186 24"/>
    <path d="M176 26 L192 21 L196 21 L188 26"/>
    <path d="M176 26 L192 32 L196 32 L188 26"/>
    <ellipse cx="58" cy="35" rx="10" ry="4"/>
    <ellipse cx="95" cy="35" rx="10" ry="4"/>
    <line x1="48" y1="29" x2="48" y2="38"/>
    <circle cx="48" cy="40" r="2"/>
    <line x1="140" y1="29" x2="140" y2="38"/>
    <circle cx="140" cy="40" r="2"/>
  </svg>`,

  A340: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M3 24 Q1 24 1 25.5 L1 27.5 Q1 29 3 29 L182 29 Q187 29 190 26.5 Q187 24 182 24 L3 24 Z"/>
    <line x1="12" y1="26" x2="168" y2="26" stroke-dasharray="2,4"/>
    <path d="M2 25.5 L1 26.5 L2 27.5"/>
    <path d="M60 29 L32 48 L42 48 L105 29"/>
    <path d="M60 24 L90 10 L98 10 L75 24"/>
    <path d="M172 24 L178 4 L184 4 L188 24"/>
    <path d="M178 26 L195 20 L198 20 L190 26"/>
    <path d="M178 26 L195 33 L198 33 L190 26"/>
    <ellipse cx="48" cy="34" rx="7" ry="3"/>
    <ellipse cx="68" cy="34" rx="7" ry="3"/>
    <ellipse cx="92" cy="34" rx="7" ry="3"/>
    <ellipse cx="112" cy="34" rx="7" ry="3"/>
    <line x1="42" y1="29" x2="42" y2="38"/>
    <circle cx="42" cy="40" r="2"/>
    <line x1="145" y1="29" x2="145" y2="38"/>
    <circle cx="145" cy="40" r="2"/>
  </svg>`,

  A350: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L182 29 Q187 29 190 26.5 Q187 24 182 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="168" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M62 29 L35 47 L45 47 L102 29"/>
    <path d="M62 24 L90 11 L98 11 L75 24"/>
    <path d="M172 24 L178 5 L184 5 L188 24"/>
    <path d="M178 26 L194 20 L198 20 L190 26"/>
    <path d="M178 26 L194 33 L198 33 L190 26"/>
    <ellipse cx="55" cy="35" rx="11" ry="4"/>
    <ellipse cx="98" cy="35" rx="11" ry="4"/>
    <line x1="45" y1="29" x2="45" y2="39"/>
    <circle cx="45" cy="41" r="2"/>
    <line x1="142" y1="29" x2="142" y2="39"/>
    <circle cx="142" cy="41" r="2"/>
  </svg>`,

  A380: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M3 22 Q1 22 1 25 L1 28 Q1 31 3 31 L182 31 Q188 31 192 26.5 Q188 22 182 22 L3 22 Z"/>
    <line x1="12" y1="25" x2="170" y2="25" stroke-dasharray="2,4"/>
    <line x1="12" y1="28" x2="170" y2="28" stroke-dasharray="2,4"/>
    <path d="M2 24 L1 26.5 L2 29"/>
    <path d="M55 31 L22 50 L35 50 L110 31"/>
    <path d="M55 22 L95 6 L105 6 L72 22"/>
    <path d="M172 22 L180 2 L188 2 L192 22"/>
    <path d="M180 26 L198 18 L200 18 L194 26"/>
    <path d="M180 26 L198 35 L200 35 L194 26"/>
    <ellipse cx="42" cy="37" rx="10" ry="4"/>
    <ellipse cx="68" cy="37" rx="10" ry="4"/>
    <ellipse cx="100" cy="37" rx="10" ry="4"/>
    <ellipse cx="126" cy="37" rx="10" ry="4"/>
    <line x1="35" y1="31" x2="35" y2="42"/>
    <circle cx="35" cy="44" r="2.5"/>
    <line x1="150" y1="31" x2="150" y2="42"/>
    <circle cx="150" cy="44" r="2.5"/>
  </svg>`,

  // Boeing 737 family
  B737: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M8 25 Q4 25 4 26 L4 27 Q4 28 8 28 L178 28 Q182 28 185 26 Q182 24 178 24 L8 24 Q4 24 4 25 Z"/>
    <line x1="18" y1="25" x2="162" y2="25" stroke-dasharray="2,3"/>
    <path d="M6 25 L4 26 L6 27"/>
    <path d="M72 28 L52 42 L58 42 L98 28"/>
    <path d="M72 24 L88 14 L94 14 L82 24"/>
    <path d="M168 24 L173 10 L178 10 L182 24"/>
    <path d="M173 26 L188 22 L190 22 L183 26"/>
    <path d="M173 26 L188 30 L190 30 L183 26"/>
    <ellipse cx="68" cy="31" rx="8" ry="3"/>
    <ellipse cx="95" cy="31" rx="8" ry="3"/>
    <line x1="58" y1="28" x2="58" y2="35"/>
    <circle cx="58" cy="36" r="1.5"/>
    <line x1="132" y1="28" x2="132" y2="35"/>
    <circle cx="132" cy="36" r="1.5"/>
  </svg>`,

  B747: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M3 23 Q1 23 1 25.5 L1 28.5 Q1 31 3 31 L180 31 Q186 31 190 27 Q186 23 180 23 L30 23 Q20 23 15 20 L12 18 Q10 17 10 19 L10 23 L3 23 Z"/>
    <line x1="20" y1="26" x2="168" y2="26" stroke-dasharray="2,4"/>
    <path d="M12 20 L10 21 L12 22"/>
    <path d="M55 31 L25 50 L38 50 L108 31"/>
    <path d="M55 23 L92 8 L100 8 L70 23"/>
    <path d="M170 23 L178 3 L185 3 L188 23"/>
    <path d="M178 27 L195 20 L198 20 L190 27"/>
    <path d="M178 27 L195 35 L198 35 L190 27"/>
    <ellipse cx="42" cy="37" rx="9" ry="3.5"/>
    <ellipse cx="68" cy="37" rx="9" ry="3.5"/>
    <ellipse cx="100" cy="37" rx="9" ry="3.5"/>
    <ellipse cx="126" cy="37" rx="9" ry="3.5"/>
    <line x1="35" y1="31" x2="35" y2="40"/>
    <circle cx="35" cy="42" r="2"/>
    <line x1="148" y1="31" x2="148" y2="40"/>
    <circle cx="148" cy="42" r="2"/>
  </svg>`,

  B757: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 25 Q2 25 2 26 L2 27 Q2 28 5 28 L182 28 Q186 28 189 26 Q186 24 182 24 L5 24 Q2 24 2 25 Z"/>
    <line x1="15" y1="25" x2="168" y2="25" stroke-dasharray="2,3"/>
    <path d="M4 25 L2 26 L4 27"/>
    <path d="M68 28 L48 44 L54 44 L98 28"/>
    <path d="M68 24 L88 12 L94 12 L78 24"/>
    <path d="M172 24 L178 8 L183 8 L186 24"/>
    <path d="M178 26 L192 22 L194 22 L186 26"/>
    <path d="M178 26 L192 30 L194 30 L186 26"/>
    <ellipse cx="62" cy="33" rx="9" ry="3"/>
    <ellipse cx="94" cy="33" rx="9" ry="3"/>
    <line x1="52" y1="28" x2="52" y2="36"/>
    <circle cx="52" cy="38" r="1.5"/>
    <line x1="138" y1="28" x2="138" y2="36"/>
    <circle cx="138" cy="38" r="1.5"/>
  </svg>`,

  B767: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L180 29 Q185 29 188 26.5 Q185 24 180 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="166" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M65 29 L42 46 L50 46 L100 29"/>
    <path d="M65 24 L88 12 L95 12 L78 24"/>
    <path d="M170 24 L176 6 L182 6 L186 24"/>
    <path d="M176 26 L192 21 L195 21 L188 26"/>
    <path d="M176 26 L192 32 L195 32 L188 26"/>
    <ellipse cx="58" cy="35" rx="10" ry="4"/>
    <ellipse cx="96" cy="35" rx="10" ry="4"/>
    <line x1="48" y1="29" x2="48" y2="38"/>
    <circle cx="48" cy="40" r="2"/>
    <line x1="140" y1="29" x2="140" y2="38"/>
    <circle cx="140" cy="40" r="2"/>
  </svg>`,

  B777: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M3 24 Q1 24 1 25.5 L1 27.5 Q1 29 3 29 L182 29 Q188 29 192 26.5 Q188 24 182 24 L3 24 Z"/>
    <line x1="12" y1="26" x2="170" y2="26" stroke-dasharray="2,4"/>
    <path d="M2 25.5 L1 26.5 L2 27.5"/>
    <path d="M60 29 L32 48 L42 48 L105 29"/>
    <path d="M60 24 L92 10 L100 10 L75 24"/>
    <path d="M172 24 L180 4 L186 4 L190 24"/>
    <path d="M180 26 L196 20 L198 20 L192 26"/>
    <path d="M180 26 L196 33 L198 33 L192 26"/>
    <ellipse cx="52" cy="36" rx="12" ry="4.5"/>
    <ellipse cx="102" cy="36" rx="12" ry="4.5"/>
    <line x1="42" y1="29" x2="42" y2="40"/>
    <circle cx="42" cy="42" r="2"/>
    <line x1="148" y1="29" x2="148" y2="40"/>
    <circle cx="148" cy="42" r="2"/>
  </svg>`,

  B787: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L182 29 Q187 29 190 26.5 Q187 24 182 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="168" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M62 29 L35 47 L45 47 L102 29"/>
    <path d="M62 24 L92 10 L100 10 L75 24"/>
    <path d="M172 24 L178 5 L184 5 L188 24"/>
    <path d="M178 26 L194 20 L198 20 L190 26"/>
    <path d="M178 26 L194 33 L198 33 L190 26"/>
    <ellipse cx="55" cy="36" rx="11" ry="4"/>
    <ellipse cx="100" cy="36" rx="11" ry="4"/>
    <line x1="45" y1="29" x2="45" y2="39"/>
    <circle cx="45" cy="41" r="2"/>
    <line x1="145" y1="29" x2="145" y2="39"/>
    <circle cx="145" cy="41" r="2"/>
  </svg>`,

  // Embraer
  E170: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M15 26 Q12 26 12 27 L12 28 Q12 29 15 29 L172 29 Q176 29 178 27.5 Q176 26 172 26 L15 26 Z"/>
    <line x1="25" y1="27" x2="158" y2="27" stroke-dasharray="2,2.5"/>
    <path d="M14 27 L12 27.5 L14 28"/>
    <path d="M75 29 L60 40 L65 40 L95 29"/>
    <path d="M75 26 L88 18 L92 18 L82 26"/>
    <path d="M162 26 L167 14 L172 14 L175 26"/>
    <path d="M168 27.5 L180 24 L182 24 L176 27.5"/>
    <path d="M168 27.5 L180 31 L182 31 L176 27.5"/>
    <ellipse cx="72" cy="32" rx="7" ry="2.5"/>
    <ellipse cx="92" cy="32" rx="7" ry="2.5"/>
    <line x1="62" y1="29" x2="62" y2="34"/>
    <circle cx="62" cy="35" r="1.2"/>
    <line x1="128" y1="29" x2="128" y2="34"/>
    <circle cx="128" cy="35" r="1.2"/>
  </svg>`,

  E190: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M12 26 Q8 26 8 27 L8 28 Q8 29 12 29 L175 29 Q180 29 182 27.5 Q180 26 175 26 L12 26 Z"/>
    <line x1="22" y1="27" x2="162" y2="27" stroke-dasharray="2,2.5"/>
    <path d="M10 27 L8 27.5 L10 28"/>
    <path d="M72 29 L55 42 L60 42 L98 29"/>
    <path d="M72 26 L88 16 L93 16 L80 26"/>
    <path d="M165 26 L170 12 L175 12 L178 26"/>
    <path d="M170 27.5 L184 23 L186 23 L180 27.5"/>
    <path d="M170 27.5 L184 32 L186 32 L180 27.5"/>
    <ellipse cx="68" cy="33" rx="8" ry="3"/>
    <ellipse cx="94" cy="33" rx="8" ry="3"/>
    <line x1="58" y1="29" x2="58" y2="36"/>
    <circle cx="58" cy="37" r="1.5"/>
    <line x1="132" y1="29" x2="132" y2="36"/>
    <circle cx="132" cy="37" r="1.5"/>
  </svg>`,

  // ATR turboprop (high wing)
  ATR: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M12 28 Q8 28 8 29.5 L8 31.5 Q8 33 12 33 L175 33 Q180 33 182 30.5 Q180 28 175 28 L12 28 Z"/>
    <line x1="22" y1="30" x2="162" y2="30" stroke-dasharray="2,3"/>
    <path d="M10 29.5 L8 30.5 L10 31.5"/>
    <!-- High wing -->
    <path d="M55 28 L55 24 L140 24 L140 28"/>
    <path d="M55 24 L40 24 L35 26"/>
    <path d="M140 24 L155 24 L160 26"/>
    <!-- Engines on wing -->
    <ellipse cx="75" cy="27" rx="8" ry="3"/>
    <ellipse cx="120" cy="27" rx="8" ry="3"/>
    <!-- Propeller arcs -->
    <path d="M67 27 Q67 20 75 20 Q83 20 83 27" fill="none"/>
    <path d="M112 27 Q112 20 120 20 Q128 20 128 27" fill="none"/>
    <!-- Tail -->
    <path d="M165 28 L170 16 L175 16 L178 28"/>
    <path d="M170 30 L185 27 L187 27 L180 30"/>
    <path d="M170 30 L185 34 L187 34 L180 30"/>
    <line x1="70" y1="33" x2="70" y2="40"/>
    <circle cx="70" cy="41" r="1.5"/>
    <line x1="125" y1="33" x2="125" y2="40"/>
    <circle cx="125" cy="41" r="1.5"/>
  </svg>`,

  // DHC-8 / Q400 (T-tail turboprop)
  DHC8: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M10 28 Q6 28 6 29.5 L6 31.5 Q6 33 10 33 L178 33 Q183 33 185 30.5 Q183 28 178 28 L10 28 Z"/>
    <line x1="20" y1="30" x2="165" y2="30" stroke-dasharray="2,3"/>
    <path d="M8 29.5 L6 30.5 L8 31.5"/>
    <!-- High wing -->
    <path d="M52 28 L52 24 L145 24 L145 28"/>
    <path d="M52 24 L38 24 L32 26"/>
    <path d="M145 24 L160 24 L166 26"/>
    <!-- Engines -->
    <ellipse cx="72" cy="27" rx="9" ry="3"/>
    <ellipse cx="125" cy="27" rx="9" ry="3"/>
    <!-- Props -->
    <path d="M63 27 Q63 19 72 19 Q81 19 81 27" fill="none"/>
    <path d="M116 27 Q116 19 125 19 Q134 19 134 27" fill="none"/>
    <!-- T-tail -->
    <path d="M168 28 L172 12 L177 12 L180 28"/>
    <path d="M165 13 L190 13"/>
    <path d="M165 13 L165 11 L188 11 L190 13"/>
    <line x1="68" y1="33" x2="68" y2="40"/>
    <circle cx="68" cy="42" r="1.5"/>
    <line x1="130" y1="33" x2="130" y2="40"/>
    <circle cx="130" cy="42" r="1.5"/>
  </svg>`,

  Q400: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M6 28 Q2 28 2 29.5 L2 31.5 Q2 33 6 33 L182 33 Q188 33 190 30.5 Q188 28 182 28 L6 28 Z"/>
    <line x1="16" y1="30" x2="172" y2="30" stroke-dasharray="2,3"/>
    <path d="M4 29.5 L2 30.5 L4 31.5"/>
    <!-- High wing -->
    <path d="M48 28 L48 24 L152 24 L152 28"/>
    <path d="M48 24 L32 24 L26 26"/>
    <path d="M152 24 L168 24 L174 26"/>
    <!-- Engines -->
    <ellipse cx="70" cy="27" rx="10" ry="3.5"/>
    <ellipse cx="130" cy="27" rx="10" ry="3.5"/>
    <!-- Props -->
    <path d="M60 27 Q60 18 70 18 Q80 18 80 27" fill="none"/>
    <path d="M120 27 Q120 18 130 18 Q140 18 140 27" fill="none"/>
    <!-- T-tail -->
    <path d="M175 28 L180 10 L186 10 L189 28"/>
    <path d="M172 11 L198 11"/>
    <path d="M172 11 L172 9 L196 9 L198 11"/>
    <line x1="65" y1="33" x2="65" y2="42"/>
    <circle cx="65" cy="44" r="2"/>
    <line x1="135" y1="33" x2="135" y2="42"/>
    <circle cx="135" cy="44" r="2"/>
  </svg>`,

  // CRJ
  CRJ: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M15 26 Q12 26 12 27 L12 28 Q12 29 15 29 L172 29 Q176 29 178 27.5 Q176 26 172 26 L15 26 Z"/>
    <line x1="25" y1="27" x2="158" y2="27" stroke-dasharray="2,2.5"/>
    <path d="M14 27 L12 27.5 L14 28"/>
    <path d="M78 29 L62 40 L67 40 L98 29"/>
    <path d="M78 26 L90 18 L95 18 L85 26"/>
    <!-- T-tail -->
    <path d="M162 26 L167 12 L172 12 L175 26"/>
    <path d="M160 13 L182 13"/>
    <path d="M160 13 L160 11 L180 11 L182 13"/>
    <!-- Rear engines -->
    <ellipse cx="165" cy="24" rx="8" ry="3"/>
    <ellipse cx="165" cy="30" rx="8" ry="3"/>
    <line x1="65" y1="29" x2="65" y2="34"/>
    <circle cx="65" cy="35.5" r="1.2"/>
    <line x1="125" y1="29" x2="125" y2="34"/>
    <circle cx="125" cy="35.5" r="1.2"/>
  </svg>`,

  // Fokker
  F100: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M12 26 Q8 26 8 27 L8 28 Q8 29 12 29 L175 29 Q180 29 182 27.5 Q180 26 175 26 L12 26 Z"/>
    <line x1="22" y1="27" x2="162" y2="27" stroke-dasharray="2,2.5"/>
    <path d="M10 27 L8 27.5 L10 28"/>
    <path d="M75 29 L58 42 L63 42 L100 29"/>
    <path d="M75 26 L90 16 L95 16 L82 26"/>
    <!-- T-tail -->
    <path d="M165 26 L170 12 L175 12 L178 26"/>
    <path d="M162 13 L185 13"/>
    <path d="M162 13 L162 11 L183 11 L185 13"/>
    <!-- Rear engines -->
    <ellipse cx="168" cy="24" rx="8" ry="2.5"/>
    <ellipse cx="168" cy="30" rx="8" ry="2.5"/>
    <line x1="62" y1="29" x2="62" y2="36"/>
    <circle cx="62" cy="37.5" r="1.5"/>
    <line x1="130" y1="29" x2="130" y2="36"/>
    <circle cx="130" cy="37.5" r="1.5"/>
  </svg>`,

  // Soviet/Russian
  IL62: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 26 L2 28 Q2 30 5 30 L178 30 Q184 30 188 27 Q184 24 178 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="165" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25 L2 27 L4 29"/>
    <path d="M65 30 L42 46 L50 46 L100 30"/>
    <path d="M65 24 L88 12 L95 12 L78 24"/>
    <!-- T-tail -->
    <path d="M170 24 L176 6 L182 6 L186 24"/>
    <path d="M168 8 L192 8"/>
    <path d="M168 8 L168 5 L190 5 L192 8"/>
    <!-- 4 rear engines -->
    <ellipse cx="172" cy="22" rx="7" ry="2.5"/>
    <ellipse cx="182" cy="22" rx="7" ry="2.5"/>
    <ellipse cx="172" cy="32" rx="7" ry="2.5"/>
    <ellipse cx="182" cy="32" rx="7" ry="2.5"/>
    <line x1="48" y1="30" x2="48" y2="40"/>
    <circle cx="48" cy="42" r="2"/>
    <line x1="140" y1="30" x2="140" y2="40"/>
    <circle cx="140" cy="42" r="2"/>
  </svg>`,

  TU154: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M8 25 Q4 25 4 26.5 L4 28.5 Q4 30 8 30 L178 30 Q183 30 186 27.5 Q183 25 178 25 L8 25 Z"/>
    <line x1="18" y1="27" x2="165" y2="27" stroke-dasharray="2,3"/>
    <path d="M6 26 L4 27.5 L6 29"/>
    <path d="M68 30 L48 44 L54 44 L98 30"/>
    <path d="M68 25 L88 14 L94 14 L78 25"/>
    <!-- T-tail -->
    <path d="M168 25 L174 8 L180 8 L184 25"/>
    <path d="M166 10 L190 10"/>
    <path d="M166 10 L166 7 L188 7 L190 10"/>
    <!-- 3 rear engines (2 side + 1 center) -->
    <ellipse cx="172" cy="24" rx="8" ry="3"/>
    <ellipse cx="172" cy="31" rx="8" ry="3"/>
    <ellipse cx="180" cy="12" rx="5" ry="2"/>
    <line x1="52" y1="30" x2="52" y2="38"/>
    <circle cx="52" cy="40" r="1.5"/>
    <line x1="138" y1="30" x2="138" y2="38"/>
    <circle cx="138" cy="40" r="1.5"/>
  </svg>`,

  // Generic fallbacks
  NARROWBODY: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M10 25 Q5 25 5 26 L5 27 Q5 28 10 28 L178 28 Q182 28 185 26 Q182 24 178 24 L10 24 Q5 24 5 25 Z"/>
    <line x1="20" y1="25" x2="162" y2="25" stroke-dasharray="2,3"/>
    <path d="M8 25 L5 26 L8 27"/>
    <path d="M72 28 L52 42 L58 42 L98 28"/>
    <path d="M72 24 L88 14 L94 14 L82 24"/>
    <path d="M168 24 L173 10 L178 10 L182 24"/>
    <path d="M173 26 L188 22 L190 22 L183 26"/>
    <path d="M173 26 L188 30 L190 30 L183 26"/>
    <ellipse cx="68" cy="32" rx="8" ry="3"/>
    <ellipse cx="95" cy="32" rx="8" ry="3"/>
    <line x1="58" y1="28" x2="58" y2="35"/>
    <circle cx="58" cy="36" r="1.5"/>
    <line x1="132" y1="28" x2="132" y2="35"/>
    <circle cx="132" cy="36" r="1.5"/>
  </svg>`,

  WIDEBODY: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L182 29 Q187 29 190 26.5 Q187 24 182 24 L5 24 Z"/>
    <line x1="15" y1="26" x2="168" y2="26" stroke-dasharray="2,4"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M62 29 L35 47 L45 47 L102 29"/>
    <path d="M62 24 L92 10 L100 10 L75 24"/>
    <path d="M172 24 L178 5 L184 5 L188 24"/>
    <path d="M178 26 L194 20 L198 20 L190 26"/>
    <path d="M178 26 L194 33 L198 33 L190 26"/>
    <ellipse cx="55" cy="36" rx="11" ry="4"/>
    <ellipse cx="100" cy="36" rx="11" ry="4"/>
    <line x1="45" y1="29" x2="45" y2="39"/>
    <circle cx="45" cy="41" r="2"/>
    <line x1="145" y1="29" x2="145" y2="39"/>
    <circle cx="145" cy="41" r="2"/>
  </svg>`,

  REGIONAL: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M15 26 Q12 26 12 27 L12 28 Q12 29 15 29 L172 29 Q176 29 178 27.5 Q176 26 172 26 L15 26 Z"/>
    <line x1="25" y1="27" x2="158" y2="27" stroke-dasharray="2,2.5"/>
    <path d="M14 27 L12 27.5 L14 28"/>
    <path d="M75 29 L60 40 L65 40 L95 29"/>
    <path d="M75 26 L88 18 L92 18 L82 26"/>
    <path d="M162 26 L167 14 L172 14 L175 26"/>
    <path d="M168 27.5 L180 24 L182 24 L176 27.5"/>
    <path d="M168 27.5 L180 31 L182 31 L176 27.5"/>
    <ellipse cx="72" cy="32" rx="7" ry="2.5"/>
    <ellipse cx="92" cy="32" rx="7" ry="2.5"/>
    <line x1="62" y1="29" x2="62" y2="34"/>
    <circle cx="62" cy="35" r="1.2"/>
    <line x1="128" y1="29" x2="128" y2="34"/>
    <circle cx="128" cy="35" r="1.2"/>
  </svg>`,

  CARGO: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M5 24 Q2 24 2 25.5 L2 27.5 Q2 29 5 29 L182 29 Q187 29 190 26.5 Q187 24 182 24 L5 24 Z"/>
    <path d="M4 25.5 L2 26.5 L4 27.5"/>
    <path d="M62 29 L35 47 L45 47 L102 29"/>
    <path d="M62 24 L92 10 L100 10 L75 24"/>
    <path d="M172 24 L178 5 L184 5 L188 24"/>
    <path d="M178 26 L194 20 L198 20 L190 26"/>
    <path d="M178 26 L194 33 L198 33 L190 26"/>
    <ellipse cx="55" cy="36" rx="11" ry="4"/>
    <ellipse cx="100" cy="36" rx="11" ry="4"/>
    <!-- Cargo door indication -->
    <rect x="20" y="24.5" width="25" height="4" rx="0.5" fill="none"/>
    <line x1="45" y1="29" x2="45" y2="39"/>
    <circle cx="45" cy="41" r="2"/>
    <line x1="145" y1="29" x2="145" y2="39"/>
    <circle cx="145" cy="41" r="2"/>
  </svg>`,

  TURBOPROP: `<svg viewBox="0 0 200 50" fill="none" stroke="currentColor" stroke-width="1">
    <path d="M12 28 Q8 28 8 29.5 L8 31.5 Q8 33 12 33 L175 33 Q180 33 182 30.5 Q180 28 175 28 L12 28 Z"/>
    <line x1="22" y1="30" x2="162" y2="30" stroke-dasharray="2,3"/>
    <path d="M10 29.5 L8 30.5 L10 31.5"/>
    <path d="M55 28 L55 24 L140 24 L140 28"/>
    <path d="M55 24 L40 24 L35 26"/>
    <path d="M140 24 L155 24 L160 26"/>
    <ellipse cx="75" cy="27" rx="8" ry="3"/>
    <ellipse cx="120" cy="27" rx="8" ry="3"/>
    <path d="M67 27 Q67 20 75 20 Q83 20 83 27" fill="none"/>
    <path d="M112 27 Q112 20 120 20 Q128 20 128 27" fill="none"/>
    <path d="M165 28 L170 16 L175 16 L178 28"/>
    <path d="M170 30 L185 27 L187 27 L180 30"/>
    <path d="M170 30 L185 34 L187 34 L180 30"/>
    <line x1="70" y1="33" x2="70" y2="40"/>
    <circle cx="70" cy="41" r="1.5"/>
    <line x1="125" y1="33" x2="125" y2="40"/>
    <circle cx="125" cy="41" r="1.5"/>
  </svg>`
};

// ICAO code to silhouette mapping
const icaoToSilhouette = {
  // Airbus narrowbody
  'A318': 'A319', 'A319': 'A319', 'A320': 'A320', 'A20N': 'A320', 'A321': 'A321', 'A21N': 'A321',
  // Airbus widebody
  'A332': 'A330', 'A333': 'A330', 'A339': 'A330',
  'A342': 'A340', 'A343': 'A340', 'A345': 'A340', 'A346': 'A340',
  'A359': 'A350', 'A35K': 'A350',
  'A388': 'A380',
  'A30B': 'A330', 'A310': 'A330',
  'BCS1': 'E190', 'BCS3': 'E190',

  // Boeing
  'B732': 'B737', 'B733': 'B737', 'B734': 'B737', 'B735': 'B737',
  'B736': 'B737', 'B737': 'B737', 'B738': 'B737', 'B739': 'B737',
  'B37M': 'B737', 'B38M': 'B737', 'B39M': 'B737', 'B3XM': 'B737',
  'B741': 'B747', 'B742': 'B747', 'B743': 'B747', 'B744': 'B747', 'B748': 'B747', 'B74S': 'B747',
  'B752': 'B757', 'B753': 'B757',
  'B762': 'B767', 'B763': 'B767', 'B764': 'B767',
  'B772': 'B777', 'B773': 'B777', 'B77W': 'B777', 'B77L': 'B777', 'B77F': 'B777', 'B778': 'B777', 'B779': 'B777',
  'B788': 'B787', 'B789': 'B787', 'B78X': 'B787',
  'B703': 'B757', 'B720': 'B737', 'B721': 'B737', 'B722': 'B737',

  // Embraer
  'E170': 'E170', 'E75S': 'E170', 'E75L': 'E170',
  'E190': 'E190', 'E195': 'E190', 'E290': 'E190', 'E295': 'E190',
  'E135': 'CRJ', 'E145': 'CRJ',

  // Bombardier/CRJ
  'CRJ1': 'CRJ', 'CRJ2': 'CRJ', 'CRJ7': 'CRJ', 'CRJ9': 'CRJ', 'CRJX': 'CRJ',
  'DH8A': 'DHC8', 'DH8B': 'DHC8', 'DH8C': 'DHC8', 'DH8D': 'Q400',

  // ATR
  'AT43': 'ATR', 'AT45': 'ATR', 'AT46': 'ATR', 'AT72': 'ATR', 'AT76': 'ATR',

  // Fokker
  'F50': 'ATR', 'F70': 'F100', 'F100': 'F100', 'F27': 'ATR', 'F28': 'F100',

  // Soviet/Russian
  'IL62': 'IL62', 'IL86': 'A380', 'IL96': 'A350',
  'T134': 'CRJ', 'T154': 'TU154', 'T204': 'A321',
  'AN24': 'ATR', 'AN26': 'ATR', 'A148': 'E170',
  'SU95': 'E190', 'MC21': 'A321',

  // Douglas/McDonnell Douglas
  'DC3': 'ATR', 'DC86': 'B757', 'DC93': 'B737', 'DC95': 'B737',
  'DC10': 'A340', 'MD11': 'A340', 'MD80': 'B737', 'MD81': 'B737', 'MD82': 'B737', 'MD83': 'B737', 'MD87': 'B737', 'MD88': 'B737', 'MD90': 'B737',
  'L101': 'A340',

  // Saab
  'SF34': 'ATR', 'SB20': 'ATR',

  // BAe
  'B461': 'CRJ', 'B462': 'CRJ', 'B463': 'CRJ', 'BA11': 'B737',
  'ATP': 'ATR', 'JS31': 'ATR', 'JS32': 'ATR', 'JS41': 'ATR'
};

/**
 * Get silhouette SVG for an aircraft
 * @param {Object} aircraft - Aircraft object with icaoCode, type, manufacturer, model
 * @returns {string} SVG string
 */
function getAircraftSilhouette(aircraft) {
  // Try ICAO code first
  if (aircraft.icaoCode && icaoToSilhouette[aircraft.icaoCode]) {
    const key = icaoToSilhouette[aircraft.icaoCode];
    if (aircraftSilhouettes[key]) {
      return aircraftSilhouettes[key];
    }
  }

  // Try model-based lookup
  const model = (aircraft.model || '').toUpperCase();
  const manufacturer = (aircraft.manufacturer || '').toUpperCase();

  // Airbus
  if (manufacturer.includes('AIRBUS') || model.startsWith('A3') || model.startsWith('A2')) {
    if (model.includes('319')) return aircraftSilhouettes.A319;
    if (model.includes('320') || model.includes('220')) return aircraftSilhouettes.A320;
    if (model.includes('321')) return aircraftSilhouettes.A321;
    if (model.includes('330')) return aircraftSilhouettes.A330;
    if (model.includes('340')) return aircraftSilhouettes.A340;
    if (model.includes('350')) return aircraftSilhouettes.A350;
    if (model.includes('380')) return aircraftSilhouettes.A380;
  }

  // Boeing
  if (manufacturer.includes('BOEING') || model.startsWith('B7') || model.startsWith('7')) {
    if (model.includes('737') || model.includes('B737')) return aircraftSilhouettes.B737;
    if (model.includes('747') || model.includes('B747')) return aircraftSilhouettes.B747;
    if (model.includes('757') || model.includes('B757')) return aircraftSilhouettes.B757;
    if (model.includes('767') || model.includes('B767')) return aircraftSilhouettes.B767;
    if (model.includes('777') || model.includes('B777')) return aircraftSilhouettes.B777;
    if (model.includes('787') || model.includes('B787')) return aircraftSilhouettes.B787;
    if (model.includes('727')) return aircraftSilhouettes.B737;
    if (model.includes('707') || model.includes('720')) return aircraftSilhouettes.B757;
  }

  // Embraer
  if (manufacturer.includes('EMBRAER') || model.startsWith('E1') || model.startsWith('E2') || model.startsWith('ERJ')) {
    if (model.includes('170') || model.includes('175')) return aircraftSilhouettes.E170;
    if (model.includes('190') || model.includes('195')) return aircraftSilhouettes.E190;
    if (model.includes('135') || model.includes('145')) return aircraftSilhouettes.CRJ;
  }

  // ATR
  if (manufacturer.includes('ATR') || model.includes('ATR')) return aircraftSilhouettes.ATR;

  // Bombardier / DHC
  if (manufacturer.includes('BOMBARDIER') || manufacturer.includes('DE HAVILLAND')) {
    if (model.includes('CRJ')) return aircraftSilhouettes.CRJ;
    if (model.includes('Q400') || model.includes('DASH 8-400')) return aircraftSilhouettes.Q400;
    if (model.includes('DHC-8') || model.includes('DASH 8')) return aircraftSilhouettes.DHC8;
  }

  // Fokker
  if (manufacturer.includes('FOKKER')) {
    if (model.includes('100') || model.includes('70') || model.includes('28')) return aircraftSilhouettes.F100;
    if (model.includes('50') || model.includes('27')) return aircraftSilhouettes.ATR;
  }

  // Soviet/Russian
  if (model.includes('IL-62') || model.includes('IL62')) return aircraftSilhouettes.IL62;
  if (model.includes('TU-154') || model.includes('TU154')) return aircraftSilhouettes.TU154;

  // McDonnell Douglas
  if (manufacturer.includes('MCDONNELL') || manufacturer.includes('DOUGLAS')) {
    if (model.includes('MD-11') || model.includes('DC-10')) return aircraftSilhouettes.A340;
    if (model.includes('MD-8') || model.includes('MD-9') || model.includes('DC-9')) return aircraftSilhouettes.B737;
  }

  // Fallback to type-based
  const type = (aircraft.type || '').toLowerCase();
  if (type.includes('widebody') || type.includes('wide')) return aircraftSilhouettes.WIDEBODY;
  if (type.includes('regional')) return aircraftSilhouettes.REGIONAL;
  if (type.includes('cargo')) return aircraftSilhouettes.CARGO;
  if (type.includes('turboprop')) return aircraftSilhouettes.TURBOPROP;

  return aircraftSilhouettes.NARROWBODY;
}

// Export for use
if (typeof window !== 'undefined') {
  window.getAircraftSilhouette = getAircraftSilhouette;
  window.aircraftSilhouettes = aircraftSilhouettes;
}
