/** Decorative brand artwork, deliberately independent of live health/status. */
export function CompassMascot({ size = 140 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.8}
      viewBox="0 0 200 160"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22 106c-16-2-16-24 0-27 2-19 29-22 36-6 19-8 29 20 10 27"
        fill="#fffdf9"
        stroke="#dfd5e9"
        strokeWidth="2"
      />
      <path
        d="M150 65c-6-14 12-23 20-14 12-6 24 10 14 19h-28"
        fill="#fffdf9"
        stroke="#dfd5e9"
        strokeWidth="2"
      />
      <ellipse cx="104" cy="146" rx="49" ry="7" fill="#e5dce9" />
      <path
        d="m51 102-16 9m118-9 14 7"
        stroke="#766086"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="m78 130-3 13m48-13 4 13"
        stroke="#766086"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect
        x="49"
        y="28"
        width="104"
        height="108"
        rx="36"
        fill="#e5d8f7"
        stroke="#766086"
        strokeWidth="3"
      />
      <rect x="58" y="36" width="86" height="91" rx="29" fill="#fffaf2" />
      <path
        d="m104 46 16 27-28-7 12-20Z"
        fill="#86beac"
        stroke="#658c80"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m92 66-10 19 38-12"
        fill="#ddd0ee"
        stroke="#8e78a7"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="84" cy="95" r="3.5" fill="#574463" />
      <circle cx="120" cy="95" r="3.5" fill="#574463" />
      <path
        d="M96 104q6 7 12 0"
        stroke="#574463"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="73" cy="104" rx="8" ry="4" fill="#f3c7c9" />
      <ellipse cx="131" cy="104" rx="8" ry="4" fill="#f3c7c9" />
      <path d="m163 18 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#efce88" />
      <path d="m28 37 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" fill="#b4cec3" />
      <circle cx="170" cy="124" r="4" fill="#d5c1eb" />
    </svg>
  );
}
