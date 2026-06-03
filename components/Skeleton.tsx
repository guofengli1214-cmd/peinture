import React from "react";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  ...props
}) => {
  return (
    <div
      className={`animate-pulse bg-fill-strong rounded-md ${className}`}
      {...props}
    />
  );
};

export const ImageSkeleton: React.FC<SkeletonProps> = ({
  className = "",
  ...props
}) => {
  return (
    <Skeleton
      className={`rounded-2xl ${className}`}
      {...props}
    />
  );
};
