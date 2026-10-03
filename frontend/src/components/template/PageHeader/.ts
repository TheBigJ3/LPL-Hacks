import { useMatch, useSearchParams } from 'react-router'
import listClientsApi from '@api/clients/listClientsApi'
import { SIDEBAR_CLIENT_MEMBER_PARAM } from '@components/template/Sidebar/.ts'
import { useApiGetQuery } from '@features/apiLayer'
import { useDocumentTitle } from '@hooks/useDocumentTitle'

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

  const clientsQuery = useApiGetQuery(listClientsApi)

  const client = clientsQuery.data?.clients.find((item) => item.slug === clientMatch?.params.clientId) ?? null
  const member = client?.members.find((item) => item.slug === searchParams.get(SIDEBAR_CLIENT_MEMBER_PARAM)) ?? null

  const trail = [
    { key: 'root', label: PAGE_HEADER_ROOT_LABEL, href: PAGE_HEADER_ROOT_HREF },
    ...(client
      ? [
        { key: 'client', label: client.name, href: `/clients/${client.slug}` },
        ...(member ? [{ key: 'member', label: member.name, href: null }] : []),
      ]
      : title === PAGE_HEADER_ROOT_LABEL ? [] : [{ key: 'page', label: title, href: null }]),
  ]

  const crumbs: PageHeaderCrumb[] = trail.map((crumb, index) => index === trail.length - 1 ? { ...crumb, href: null } : crumb)

  useDocumentTitle(title, member?.name ?? client?.name)

  return { crumbs }
}
