import { notFound } from 'next/navigation';
import { READERS, readerById } from '@/data/readers';
import { SERVICES, serviceById } from '@/data/services';
import { Draw } from './Draw';

/** Nine combinations, all known at build time. */
export function generateStaticParams() {
  return READERS.flatMap((r) => SERVICES.map((s) => ({ reader: r.id, service: s.id })));
}

export default async function DrawScreen({
  params,
}: {
  params: Promise<{ reader: string; service: string }>;
}) {
  const { reader: readerId, service: serviceId } = await params;
  const reader = readerById(readerId);
  const service = serviceById(serviceId);
  if (!reader || !service) notFound();

  return <Draw reader={reader} service={service} />;
}
