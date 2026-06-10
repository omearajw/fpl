import React, { ReactNode } from 'react';

interface PageSkeletonProps {
  children?: ReactNode;
  rows?: number;
  compact?: boolean;
  showSidebar?: boolean;
}

const widthClasses = ['w-full', 'w-5/6', 'w-4/5', 'w-3/4', 'w-2/3', 'w-1/2', 'w-1/3', 'w-1/4'];

function mergeClassName(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function getTextWidth(text: string) {
  if (text.length < 20) return widthClasses[7];
  if (text.length < 40) return widthClasses[6];
  if (text.length < 70) return widthClasses[5];
  if (text.length < 120) return widthClasses[4];
  return widthClasses[0];
}

function createSkeletonText(text: string) {
  const width = getTextWidth(text);
  return (
    <span
      className={mergeClassName('inline-block h-4 rounded-full bg-slate-200', width)}
      aria-hidden="true"
    />
  );
}

function skeletonizeNode(node: ReactNode): ReactNode {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return null;
  }

  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node).trim();
    if (!text) return null;
    return createSkeletonText(text);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => <React.Fragment key={index}>{skeletonizeNode(child)}</React.Fragment>);
  }

  if (React.isValidElement(node)) {
    const { children, className, ...restProps } = node.props as any;
    const skeletonChildren = skeletonizeNode(children);

    if (typeof node.type === 'string') {
      const skeletonClass = mergeClassName(className, 'text-transparent', 'select-none');

      if (children == null) {
        const placeholder = <span className="block h-4 w-full rounded-full bg-slate-200" aria-hidden="true" />;
        return React.cloneElement(node, { ...restProps, className: skeletonClass }, placeholder);
      }

      return React.cloneElement(node, { ...restProps, className: skeletonClass }, skeletonChildren);
    }

    return <div className="h-12 bg-slate-200 rounded-xl" aria-hidden="true" />;
  }

  return null;
}

function skeletonize(children: ReactNode): ReactNode {
  return (
    <div className="animate-pulse">
      {skeletonizeNode(children)}
    </div>
  );
}

export default function PageSkeleton({ children, rows = 3, compact = false, showSidebar = true }: PageSkeletonProps) {
  if (children) {
    return <>{skeletonize(children)}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8 animate-pulse">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="h-14 w-72 bg-slate-200 rounded-xl" />

        <div className={`grid gap-6 ${compact ? 'grid-cols-1' : 'lg:grid-cols-3'}`}>
          <div className={`${compact ? '' : 'lg:col-span-2'} space-y-6`}>
            <div className="h-64 bg-slate-200 rounded-3xl" />
            <div className="grid gap-6 sm:grid-cols-2">
              {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="h-40 bg-slate-200 rounded-3xl" />
              ))}
            </div>
          </div>

          {showSidebar && (
            <div className="space-y-6">
              <div className="h-40 bg-slate-200 rounded-3xl" />
              <div className="h-40 bg-slate-200 rounded-3xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
