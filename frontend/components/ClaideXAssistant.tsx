"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { MessageSquare, X, Send, Sparkles } from "lucide-react"

export function ClaideXAssistant() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 transition-all duration-300 animate-bounce-slow"
        >
          <MessageSquare className="h-6 w-6 text-primary-foreground" />
        </Button>
      )}

      {isOpen && (
        <Card className="w-[350px] shadow-2xl border-primary/20 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary/20 p-1.5 rounded-full">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base">ClaideX Assistant</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="h-[400px] overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            <div className="flex gap-3">
               <div className="bg-primary/20 h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
               </div>
               <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm text-sm border">
                  Hello! I can help you investigate cases, analyze claims, or generate reports. How can I assist you today?
               </div>
            </div>

            <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="text-xs h-7 bg-white">Analyze Dr. Thornton</Button>
                <Button variant="outline" size="sm" className="text-xs h-7 bg-white">Show Risk Trends</Button>
            </div>

            {/* User message placeholder */}
             <div className="flex gap-3 justify-end">
               <div className="bg-primary p-3 rounded-lg rounded-tr-none shadow-sm text-sm text-primary-foreground">
                  Compare this provider to peers in NY.
               </div>
               <div className="bg-muted h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold">JD</span>
               </div>
            </div>

             <div className="flex gap-3">
               <div className="bg-primary/20 h-8 w-8 rounded-full flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
               </div>
               <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm text-sm border space-y-2">
                  <p>Dr. Thornton's billing for CPT 99214 is <strong>34% higher</strong> than the average for Cardiologists in NY.</p>
                  <div className="h-24 bg-muted rounded animate-pulse"></div>
               </div>
            </div>

          </CardContent>
          <CardFooter className="p-3 bg-white border-t">
            <div className="relative w-full">
              <Input placeholder="Ask a question..." className="pr-10" />
              <Button size="icon" variant="ghost" className="absolute right-0 top-0 h-10 w-10 text-primary hover:text-primary/80">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
