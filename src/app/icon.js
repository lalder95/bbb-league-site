import { ImageResponse } from 'next/og';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #08111d 0%, #10233a 100%)',
          color: '#f35b2f',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: '-0.08em',
          borderRadius: 8,
          border: '2px solid rgba(243, 91, 47, 0.45)',
        }}
      >
        BBB
      </div>
    ),
    size,
  );
}