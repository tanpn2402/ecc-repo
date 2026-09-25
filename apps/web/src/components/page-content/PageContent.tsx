import classes from "./PageContent.module.css";

export type PageContentProps = React.PropsWithChildren;

export function PageContent({ children }: PageContentProps) {
  return <div className={classes.pageContent}>{children}</div>;
}
