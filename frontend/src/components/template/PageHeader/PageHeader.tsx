import './.css'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { usePageHeader } from './.ts'

const PageHeader = ({ title, children }: { title: string; children?: ReactNode }) => {
  const header = usePageHeader(title)

  return <header className="page-header grid w-full items-center">
    <nav className="page-header__crumbs min-w-0" aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-3">
        {header.crumbs.map((crumb, index) =>
          <Fragment key={crumb.key}>
            {index > 0 &&
              <li className="page-header__separator flex-none" aria-hidden="true">
                <span className="material-symbols-outlined">chevron_right</span>
              </li>}
            <li className="min-w-0 truncate">
              {crumb.href
                ? <Link to={crumb.href} className="page-header__crumb rounded-sm">{crumb.label}</Link>
                : <span className="page-header__crumb page-header__crumb-current" aria-current="page">{crumb.label}</span>}
            </li>
          </Fragment>
        )}
      </ol>
    </nav>
    {children && <div className="page-header__center flex min-w-0 items-center">{children}</div>}
  </header>
}

export default PageHeader
