import React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

// Create simple Tabs components without using Radix UI primitives directly
// This avoids any potential issues with the Radix UI setup

const Tabs = ({children, value, onValueChange, className, ...props}) => {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
};

const TabsList = ({children, className, ...props}) => {
  return (
    <div className={`inline-flex h-10 items-center justify-center rounded-md bg-black/20 p-1 text-white/70 ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

const TabsTrigger = ({children, value, className, ...props}) => {
  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all data-[state=active]:bg-[#FF4B1F] data-[state=active]:text-white ${className || ''}`}
      data-state={props['data-state']}
      {...props}
    >
      {children}
    </button>
  );
};

const TabsContent = ({children, value, className, ...props}) => {
  return (
    <div className={`mt-2 ${className || ''}`} {...props}>
      {children}
    </div>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };