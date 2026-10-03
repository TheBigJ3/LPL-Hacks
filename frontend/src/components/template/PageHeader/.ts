import { useMatch, useSearchParams } from 'react-router'
import { SIDEBAR_CLIENT_MEMBER_PARAM, SIDEBAR_DEMO_CLIENTS } from '@components/template/Sidebar/.ts'

export type PageHeaderCrumb = {
  key: string
  label: string
  href: string | null
}

const PAGE_HEADER_ROOT_LABEL = 'All Households'
const PAGE_HEADER_ROOT_HREF = '/'

export function usePageHeader(title: string) {
  const clientMatch = useMatch('/clients/:clientId/*')
  const [searchParams] = useSearchParams()

  const client = SIDEBAR_DEMO_CLIENTS.find((item) => item.id === clientMatch?.params.clientId) ?? null
  const member = client?.members.find((item) => item.id === searchParams.get(SIDEBAR_CLIENT_MEMBER_PARAM)) ?? null

  const trail = [
    { key: 'root', label: PAGE_HEADER_ROOT_LABEL, href: PAGE_HEADER_ROOT_HREF },
    ...(client
      ? [
        { key: 'client', label: client.name, href: `/clients/${client.id}` },
        ...(member ? [{ key: 'member', label: member.name, href: null }] : []),
      ]
      : [{ key: 'page', label: title, href: null }]),
  ]

  const crumbs: PageHeaderCrumb[] = trail.map((crumb, index) => index === trail.length - 1 ? { ...crumb, href: null } : crumb)

  return { crumbs }
}
