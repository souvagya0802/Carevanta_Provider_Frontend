'use client';

import { useParams, useRouter } from 'next/navigation';
import { useOrg } from '@/lib/portal';
import { AppointmentDialog } from '../page';

/** Deep link from the home page: opens the appointment dialog over the list. */
export default function AppointmentDeepLink() {
  const { id } = useParams<{ id: string }>();
  const org = useOrg();
  const router = useRouter();
  return <AppointmentDialog base={`/portal/providers/${org.providerId}`} id={id} orgType={org.type} onClose={() => router.replace('/appointments')} />;
}
