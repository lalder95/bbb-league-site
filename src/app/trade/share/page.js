import { TradePage } from '../page';

export default async function SharedTradePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const shareToken = typeof resolvedSearchParams?.s === 'string' ? resolvedSearchParams.s : '';

  return <TradePage shareMode={true} shareToken={shareToken} />;
}
