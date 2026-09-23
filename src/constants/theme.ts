export const Colors = {
  primary: '#3F3CBB',
  primaryDark: '#2E2B94',
  primarySoft: '#ECEBFB',
  background: '#F5F6FA',
  surface: '#FFFFFF',
  text: '#16182B',
  textMuted: '#5A5F73',
  border: '#E1E3EC',
  success: '#157F3D',
  successSoft: '#E3F5E9',
  warning: '#A15C07',
  warningSoft: '#FDF1DC',
  danger: '#B42318',
  dangerSoft: '#FDE8E6',
  star: '#D99A06',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** ความกว้างสูงสุดของเนื้อหา อ่านง่ายบนจอคอม (แอปรันบนเว็บด้วย) */
export const MaxContentWidth = 960;

/** พื้นที่แตะขั้นต่ำตามแนวทาง accessibility (~44pt) */
export const MinTouch = 44;
