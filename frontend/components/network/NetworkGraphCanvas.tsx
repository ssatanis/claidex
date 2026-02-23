"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { X, User, Building, Users } from "lucide-react"

const nodes = [
  { id: 1, type: "provider", x: 400, y: 300, label: "Dr. Thornton", risk: "high" },
  { id: 2, type: "member", x: 250, y: 200, label: "Member A", risk: "low" },
  { id: 3, type: "member", x: 550, y: 200, label: "Member B", risk: "medium" },
  { id: 4, type: "facility", x: 400, y: 450, label: "City Hospital", risk: "low" },
  { id: 5, type: "provider", x: 600, y: 400, label: "Dr. Smith", risk: "medium" },
]

const links = [
  { source: 1, target: 2 },
  { source: 1, target: 3 },
  { source: 1, target: 4 },
  { source: 3, target: 5 },
  { source: 4, target: 5 },
]

export function NetworkGraphCanvas() {
  const [selectedNode, setSelectedNode] = React.useState<number | null>(null)

  return (
    <div className="relative h-[600px] w-full border rounded-lg bg-slate-50 overflow-hidden">
      <svg className="h-full w-full">
        {links.map((link, i) => {
          const source = nodes.find(n => n.id === link.source)!
          const target = nodes.find(n => n.id === link.target)!
          return (
            <line
              key={i}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke="#cbd5e1"
              strokeWidth="2"
            />
          )
        })}
        {nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => setSelectedNode(node.id)}
            className="cursor-pointer transition-all duration-200 hover:scale-110"
          >
            <circle
              r="25"
              fill={node.risk === 'high' ? '#fee2e2' : node.risk === 'medium' ? '#ffedd5' : '#e0f2fe'}
              stroke={node.risk === 'high' ? '#ef4444' : node.risk === 'medium' ? '#f97316' : '#3b82f6'}
              strokeWidth={selectedNode === node.id ? "3" : "2"}
              className={node.risk === 'high' ? "animate-pulse" : ""}
            />
            <foreignObject x="-12" y="-12" width="24" height="24">
                <div className="flex items-center justify-center h-full w-full">
                    {node.type === 'provider' ? <User className={`h-4 w-4 ${node.risk === 'high' ? 'text-red-600' : 'text-blue-600'}`} /> :
                     node.type === 'facility' ? <Building className="h-4 w-4 text-slate-600" /> :
                     <Users className="h-4 w-4 text-slate-600" />}
                </div>
            </foreignObject>
            <text y="40" textAnchor="middle" className="text-xs font-medium fill-slate-600 pointer-events-none select-none">
              {node.label}
            </text>
          </g>
        ))}
      </svg>

      {selectedNode && (
        <div className="absolute right-4 top-4 w-64">
           <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardTitle className="text-sm">Node Details</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedNode(null)}>
                    <X className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-2">
                    <p className="font-bold">{nodes.find(n => n.id === selectedNode)?.label}</p>
                    <Badge variant={nodes.find(n => n.id === selectedNode)?.risk === 'high' ? 'destructive' : 'default'}>
                        {nodes.find(n => n.id === selectedNode)?.risk} Risk
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                        Connected to {links.filter(l => l.source === selectedNode || l.target === selectedNode).length} entities.
                    </p>
                    <Button size="sm" className="w-full">Open Profile</Button>
                </div>
            </CardContent>
           </Card>
        </div>
      )}
    </div>
  )
}
