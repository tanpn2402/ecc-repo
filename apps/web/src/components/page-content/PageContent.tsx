import classes from "./PageContent.module.css";

export interface PageContentProps extends React.PropsWithChildren {
  // 
}

export function PageContent({ children }: PageContentProps) {
  return <div className={classes.pageContent}>
    {children}
  </div>
}