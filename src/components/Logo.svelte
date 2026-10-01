<script lang="ts">
  /*
   * Logo Diurnus: kartka kalendarza z kółkami, siatką, kropką „dziś" i literą D.
   * Ten sam rysunek co public/favicon.svg, ale bez tła — kolor bierze z `color`
   * (w pasku: zieleń gruvbox z motywu), więc działa w jasnym i ciemnym.
   */
  interface Props {
    size?: number;
  }
  const { size = 24 }: Props = $props();
  // Identyfikator maski musi być unikalny w dokumencie.
  const mask = `logo-gap-${Math.random().toString(36).slice(2, 8)}`;
  const D = 'M52 16C80 16 90 36 90 65S80 114 52 114';
</script>

<svg
  class="logo"
  viewBox="-2 -2 124 124"
  width={size}
  height={size}
  role="img"
  aria-label="Diurnus"
>
  <defs>
    <!-- Przerwa wokół brzuszka D: wycina siatkę tylko na zewnątrz litery. -->
    <mask id={mask} maskUnits="userSpaceOnUse" x="-2" y="-2" width="124" height="124">
      <rect x="-2" y="-2" width="124" height="124" fill="#fff" />
      <path d={D} fill="none" stroke="#000" stroke-width="20" />
      <path d="M-2 -2H52V16C80 16 90 36 90 65S80 114 52 114V122H-2Z" fill="#fff" />
    </mask>
  </defs>
  <g mask="url(#{mask})" fill="currentColor" stroke="currentColor">
    <rect x="22" y="0" width="8" height="30" stroke="none" />
    <rect x="88" y="0" width="8" height="30" stroke="none" />
    <rect x="4" y="16" width="112" height="98" fill="none" stroke-width="8" />
    <path
      d="M0 42H120M0 88H120M100 64H116M58 16V42M58 88V114M31 42V114"
      fill="none"
      stroke-width="4"
    />
    <circle cx="58" cy="65" r="12" stroke="none" />
  </g>
  <path d={D} fill="none" stroke="currentColor" stroke-width="9" />
</svg>
